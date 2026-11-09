import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('security_sandbox', Path(__file__).resolve().parents[1] / 'tools/security-sandbox.py')
sandbox = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sandbox)


class SecuritySandboxTests(unittest.TestCase):
    def test_container_cannot_inherit_host_environment_or_network(self):
        command = sandbox.command('dummy', '/source', '/dependencies', '/scratch')
        for option in ['--network=none', '--read-only', '--user=65534:65534', '--cap-drop=ALL',
                       '--security-opt=no-new-privileges=true', '--pids-limit=64', '--pull=never']:
            self.assertIn(option, command)
        self.assertIn('@sha256:', sandbox.IMAGE)
        self.assertIn('-i', command)
        self.assertEqual(sum(value.startswith('type=bind,') for value in command), 3)

    @unittest.skipUnless(os.name == 'posix', 'Race-safe promotion uses POSIX directory-relative no-follow APIs')
    def test_promotion_accepts_only_one_bounded_regular_file_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as root:
            scratch, artifacts = [Path(root) / name for name in ('scratch', 'artifacts')]
            scratch.mkdir(); artifacts.mkdir()
            source_fd, destination_fd = [os.open(path, os.O_RDONLY | os.O_DIRECTORY) for path in (scratch, artifacts)]
            try:
                source = scratch / 'result.json'
                source.write_text(json.dumps({'passed': True}))
                source.rename(scratch / 'real.json')
                source.symlink_to('real.json')
                with self.assertRaises(OSError):
                    sandbox.promote(source_fd, destination_fd, 'result.json')
                source.unlink()
                os.link(scratch / 'real.json', source)
                with self.assertRaises(ValueError):
                    sandbox.promote(source_fd, destination_fd, 'result.json')
                source.unlink()
                os.mkfifo(source)
                with self.assertRaises(ValueError):
                    sandbox.promote(source_fd, destination_fd, 'result.json')
                source.unlink()
                source.write_bytes(b' ' * (sandbox.MAX_EVIDENCE + 1))
                with self.assertRaises(ValueError):
                    sandbox.promote(source_fd, destination_fd, 'result.json')
                source.write_text('{"passed":true}')
                self.assertTrue(sandbox.promote(source_fd, destination_fd, 'result.json')['passed'])
                with self.assertRaises(FileExistsError):
                    sandbox.promote(source_fd, destination_fd, 'result.json')
                with self.assertRaises(ValueError):
                    sandbox.promote(source_fd, destination_fd, '../result.json')
            finally:
                os.close(source_fd); os.close(destination_fd)
