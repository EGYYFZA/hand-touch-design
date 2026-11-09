import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';

const checks = [];
const checked = (name, condition) => { assert.ok(condition, name); checks.push(name); };
let result;
try {
  checked('non-root uid', process.getuid() === 65534);
  checked('empty environment with six safe explicit values', JSON.stringify(Object.keys(process.env).sort()) === JSON.stringify(['HOME','LANG','NODE_ENV','PATH','TMPDIR','XDG_CACHE_HOME']));
  checked('isolated loopback is the only network interface', Object.keys(networkInterfaces()).every(name => name === 'lo'));
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '198.51.100.1', port: 443 });
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error('External route unexpectedly exists')); });
    socket.once('connect', () => { socket.destroy(); reject(new Error('External network is reachable')); });
    socket.once('error', error => ['ENETUNREACH','EHOSTUNREACH','EACCES'].includes(error.code) ? resolve() : reject(error));
  });
  checks.push('kernel denies an external network connection');
  for (const path of ['/target/.sandbox-write', '/usr/local/bin/.sandbox-write', '/tmp/.sandbox-write']) {
    assert.throws(() => writeFileSync(path, 'synthetic probe'), error => ['EROFS','EACCES'].includes(error.code));
  }
  checks.push('target, toolchain and non-scratch filesystem reject writes');
  for (const folder of ['home','tmp','cache']) mkdirSync(`/scratch/${folder}`);
  const fs = statfsSync('/scratch');
  checked('scratch is a bounded 128 MiB tmpfs', fs.type === 0x01021994 && fs.bsize * fs.blocks <= 128 * 1024 * 1024);
  const mounts = readFileSync('/proc/mounts', 'utf8').split('\n').find(line => line.split(' ')[1] === '/scratch');
  checked('scratch is noexec, nosuid and nodev', ['noexec','nosuid','nodev'].every(option => mounts?.split(' ')[3].split(',').includes(option)));
  const status = readFileSync('/proc/self/status', 'utf8');
  checked('all capabilities dropped and privilege escalation disabled', /^CapEff:\s+0+$/m.test(status) && /^NoNewPrivs:\s+1$/m.test(status));
  checked('kernel seccomp filtering enabled', /^Seccomp:\s+2$/m.test(status));
  const cgroup = name => readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim();
  checked('memory cgroup capped at 512 MiB with no swap', Number(cgroup('memory.max')) === 512 * 1024 * 1024 && cgroup('memory.swap.max') === '0');
  checked('process cgroup capped at 64', cgroup('pids.max') === '64');
  const [quota, period] = cgroup('cpu.max').split(' ').map(Number);
  checked('CPU cgroup capped at one core', quota > 0 && quota / period <= 1);
  const limits = readFileSync('/proc/self/limits', 'utf8');
  checked('CPU, file size, descriptors and core dumps have hard limits', /Max cpu time\s+60\s+60/.test(limits) && /Max file size\s+8388608\s+8388608/.test(limits) && /Max open files\s+128\s+128/.test(limits) && /Max core file size\s+0\s+0/.test(limits));
  const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/web/backend-security.test.mjs', 'tests/web/netlify.test.mjs', 'tests/web/api-boundaries.test.mjs'], { cwd: '/target', encoding: 'utf8', timeout: 120000, maxBuffer: 512 * 1024 });
  const passed = Number(tests.stdout?.match(/^# pass (\d+)$/m)?.[1] || 0);
  const failed = Number(tests.stdout?.match(/^# fail (\d+)$/m)?.[1] || 0);
  result = { passed: tests.status === 0 && !tests.error && passed >= 12 && failed === 0, sandboxChecks: checks,
    tests: { passed, failed, exitCode: tests.status } };
  if (!result.passed) result.error = (tests.error?.message || tests.stdout || tests.stderr || 'Tests did not complete').slice(-6000);
} catch (error) {
  result = { passed: false, sandboxChecks: checks, tests: { passed: 0, failed: 0, exitCode: null }, error: error.message.slice(0,2000) };
}
writeFileSync('/scratch/result.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
process.exitCode = result.passed ? 0 : 1;
