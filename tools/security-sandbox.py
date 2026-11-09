"""Trusted Linux/Docker launcher; target code runs only after kernel isolation is checked."""
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid


IMAGE = 'node:22.23.4-bookworm-slim@sha256:aaa4b5baf1ecff3b283486bb1f90405cdda225a3e6f79660d2c559fa510a7292'
MAX_EVIDENCE = 1024 * 1024
TARGET_PATHS = ['server', 'api', 'config/security-headers.json', 'vercel.json',
                'package.json', 'tests/web/backend-security.test.mjs',
                'tests/web/netlify.test.mjs', 'tests/web/api-boundaries.test.mjs',
                'tools/security-sandbox-probe.mjs']


def command(name, source, dependencies, scratch):
    return ['docker', 'create', '--name', name, '--pull=never', '--network=none',
            '--read-only', '--user=65534:65534', '--cap-drop=ALL',
            '--security-opt=no-new-privileges=true', '--ipc=none',
            '--memory=512m', '--memory-swap=512m', '--cpus=1', '--pids-limit=64',
            '--ulimit=cpu=60:60', '--ulimit=fsize=8388608:8388608',
            '--ulimit=nofile=128:128', '--ulimit=core=0:0',
            '--log-driver=none', '--workdir=/target',
            '--mount', f'type=bind,src={source},dst=/target,readonly',
            '--mount', f'type=bind,src={dependencies},dst=/target/node_modules,readonly',
            '--mount', f'type=bind,src={scratch},dst=/scratch',
            '--entrypoint=/usr/bin/env', IMAGE, '-i',
            'HOME=/scratch/home', 'TMPDIR=/scratch/tmp', 'XDG_CACHE_HOME=/scratch/cache',
            'PATH=/usr/local/bin:/usr/bin:/bin', 'LANG=C.UTF-8', 'NODE_ENV=test',
            '/usr/local/bin/node', '/target/tools/security-sandbox-probe.mjs']


def promote(scratch_fd, artifacts_fd, name):
    """Promote one predeclared leaf through retained directory descriptors, never paths."""
    if name != 'result.json':
        raise ValueError('Only result.json is allowlisted')
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    source_fd = os.open(name, flags, dir_fd=scratch_fd)
    try:
        before = os.fstat(source_fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > MAX_EVIDENCE:
            raise ValueError('Evidence is not a bounded, singly linked regular file')
        data = bytearray()
        while len(data) < before.st_size:
            chunk = os.read(source_fd, min(65536, before.st_size - len(data)))
            if not chunk:
                raise ValueError('Evidence changed during reading')
            data.extend(chunk)
        after = os.fstat(source_fd)
        identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
                                  value.st_size, value.st_mtime_ns, value.st_ctime_ns)
        if identity(before) != identity(after) or len(data) > MAX_EVIDENCE:
            raise ValueError('Evidence identity or size changed')
        # Validate before retaining; there are no credentials or real user fixtures in this run.
        result = json.loads(data)
        destination_fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                                 os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=artifacts_fd)
        try:
            destination = os.fstat(destination_fd)
            if not stat.S_ISREG(destination.st_mode) or destination.st_nlink != 1:
                raise ValueError('Unsafe evidence destination')
            view = memoryview(data)
            while view:
                written = os.write(destination_fd, view)
                if written <= 0:
                    raise OSError('Incomplete evidence write')
                view = view[written:]
        finally:
            os.close(destination_fd)
        return result
    finally:
        os.close(source_fd)


def run():
    if not __debug__ or sys.platform != 'linux' or os.geteuid() != 0:
        raise SystemExit('Requires an ephemeral Linux runner with Docker and root for bounded tmpfs; no fallback execution.')
    repo = Path(__file__).resolve().parent.parent
    base = Path(tempfile.mkdtemp(prefix='egz-security-', dir='/var/tmp'))
    source, scratch, artifacts = [base / part for part in ('source', 'scratch', 'artifacts')]
    for folder in (source, scratch, artifacts):
        folder.mkdir()
    base.chmod(0o755)
    source.chmod(0o755)
    name = 'egz-security-' + uuid.uuid4().hex
    scratch_fd = artifacts_fd = None
    mounted = created = False
    # Docker CLI gets only its local socket path and a safe PATH, never CI credentials.
    parent_env = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                  'DOCKER_HOST': 'unix:///var/run/docker.sock'}

    def host(args, **options):
        return subprocess.run(args, env=parent_env, check=True, timeout=30, **options)

    try:
        files = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '-z', '--', *TARGET_PATHS]).split(b'\0')
        for encoded in filter(None, files):
            relative = Path(os.fsdecode(encoded))
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Unsafe source path')
            original = repo / relative
            if original.is_symlink() or not original.is_file():
                raise ValueError('Only regular tracked source files are permitted')
            destination = source / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, destination)
            destination.chmod(0o444)
        (source / 'node_modules').mkdir()
        dependencies = (repo / 'node_modules').resolve(strict=True)
        if dependencies.parent != repo or dependencies.is_symlink():
            raise ValueError('Dependencies must be the pre-provisioned local node_modules')
        host(['docker', 'image', 'inspect', IMAGE], stdout=subprocess.DEVNULL)
        host(['mount', '-t', 'tmpfs', '-o', 'size=128m,mode=1777,nosuid,nodev,noexec',
              'egz-security-scratch', str(scratch)])
        mounted = True
        directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        scratch_fd, artifacts_fd = [os.open(folder, directory_flags) for folder in (scratch, artifacts)]
        assert not os.get_inheritable(scratch_fd) and not os.get_inheritable(artifacts_fd)
        host(command(name, source, dependencies, scratch), stdout=subprocess.DEVNULL)
        created = True
        info = json.loads(host(['docker', 'inspect', name], capture_output=True).stdout)[0]
        settings = info['HostConfig']
        assert settings['NetworkMode'] == 'none' and settings['ReadonlyRootfs'] and not settings['Privileged']
        assert settings['CapDrop'] == ['ALL'] and 'no-new-privileges=true' in settings['SecurityOpt']
        assert settings['Memory'] == settings['MemorySwap'] == 512 * 1024 * 1024
        assert settings['PidsLimit'] == 64 and settings['NanoCpus'] == 1_000_000_000
        assert info['Config']['User'] == '65534:65534'
        assert {item['Destination']: item['RW'] for item in info['Mounts']} == {
            '/target': False, '/target/node_modules': False, '/scratch': True}
        host(['docker', 'start', name], stdout=subprocess.DEVNULL)
        # Removing the whole container also terminates descendants after timeout.
        completed = subprocess.run(['docker', 'wait', name], env=parent_env, capture_output=True,
                                   check=True, timeout=180)
        status = int(completed.stdout)
        host(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL)
        created = False
        result = promote(scratch_fd, artifacts_fd, 'result.json')
        assert status == 0 and result['passed'] is True, result
        assert result['tests']['failed'] == 0 and result['tests']['passed'] >= 12
        print(json.dumps({'artifact': str(artifacts / 'result.json'), **result}, indent=2))
    finally:
        try:
            if created:
                host(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL)
        finally:
            for descriptor in (scratch_fd, artifacts_fd):
                if descriptor is not None:
                    os.close(descriptor)
            if mounted:
                host(['umount', str(scratch)])
        # Parent-owned artifacts remain outside the repository; no target tree is copied back.


if __name__ == '__main__':
    run()
