// Local-only publication scan. Never prints matched secret values or uploads code.
import { execFileSync, spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const knownSecrets = [];
for (const envPath of ['.env.local', 'secrets/netlify-production.env']) try {
  const env = await readFile(resolve(root, envPath), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = /^(SUPABASE_SECRET_KEY|SESSION_SECRET|CRON_SECRET)\s*=\s*(.+)$/.exec(line);
    if (match) { const value = match[2].trim().replace(/^["']|["']$/g, ''); if (value.length >= 24) knownSecrets.push(value); }
  }
} catch { /* CI has no local credentials; provider-signature checks still run. */ }
try {
  const setup = JSON.parse(await readFile(resolve(root, 'secrets/supabase-project-setup.json'), 'utf8'));
  if (setup.database_password?.length >= 16) knownSecrets.push(setup.database_password);
} catch { /* CI has no local credentials; provider-signature checks still run. */ }
const signatures = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github_token', /\b(?:gh[opusr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['supabase_secret', /\bsb_secret_[A-Za-z0-9_-]{25,}\b/],
  ['aws_access_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['provider_secret', /\b(?:sk_live_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{30,})\b/],
];
const privatePath = /(?:^|\/)(?:captures|data|\.venv|venv|node_modules|secrets|\.netlify|\.vercel|\.claude|\.codex|\.agents|\.aws|\.ssh)(?:\/|$)|(?:^|\/)\.env(?:$|\.(?!example$|sample$))|\.(?:pem|key|p12|pfx|har)$/;
const findings = [], historyPaths = [], skipped = { binary: 0, over2MiB: 0 };
let textBlobs = 0;
function scan(data, source) {
  if (data.includes(0)) { skipped.binary++; return; }
  const text = data.toString('utf8'); textBlobs++;
  for (const [kind, pattern] of signatures) if (pattern.test(text)) findings.push({ kind, ...source });
  if (knownSecrets.some(value => text.includes(value))) findings.push({ kind: 'known_local_secret', ...source });
  for (const value of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\b/g)) {
    try { if (JSON.parse(Buffer.from(value[0].split('.')[1], 'base64url').toString()).role === 'service_role') findings.push({ kind: 'service_role_jwt', ...source }); } catch { /* Not a valid JWT. */ }
  }
}
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const privateFiles = files.filter(path => privatePath.test(path));
for (const path of files) {
  try { const data = await readFile(resolve(root, path)); if (data.length <= 2 * 1024 * 1024) scan(data, { scope: 'working_tree', path }); else skipped.over2MiB++; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const objects = new Map();
for (const line of git(['rev-list', '--objects', '--all']).split('\n').filter(Boolean)) {
  const at = line.indexOf(' '), id = at < 0 ? line : line.slice(0, at), path = at < 0 ? '' : line.slice(at + 1);
  objects.set(id, path); if (path && privatePath.test(path)) historyPaths.push({ object: id, path });
}
const metadata = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
  cwd: root, input: [...objects.keys()].join('\n') + '\n', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
const blobs = [];
for (const line of metadata.trim().split('\n')) {
  const [id, type, size] = line.split(' ');
  if (type !== 'blob') continue;
  if (Number(size) > 2 * 1024 * 1024) skipped.over2MiB++; else blobs.push(id);
}
await new Promise((resolveScan, reject) => {
  const child = spawn('git', ['cat-file', '--batch'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let pending = Buffer.alloc(0), current = null, stderr = '';
  child.stdout.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (true) {
      if (!current) {
        const end = pending.indexOf(10); if (end < 0) break;
        const [id, type, size] = pending.subarray(0, end).toString().split(' ');
        current = { id, size: Number(size) }; pending = pending.subarray(end + 1);
        if (type !== 'blob' || !Number.isSafeInteger(current.size)) { child.kill(); reject(new Error('Invalid Git object response')); return; }
      }
      if (pending.length < current.size + 1) break;
      scan(pending.subarray(0, current.size), { scope: 'history', object: current.id, path: objects.get(current.id) });
      pending = pending.subarray(current.size + 1); current = null;
    }
  });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('error', reject); child.on('close', code => code === 0 ? resolveScan() : reject(new Error('Git history scan failed')));
  child.stdin.end(blobs.join('\n') + '\n');
});
const summary = { candidateFiles: files.length, historicalBlobsScanned: blobs.length, textBlobsScanned: textBlobs,
  secretFindings: findings.length, privateWorkingTreePaths: privateFiles.length, privateHistoryPaths: historyPaths.length,
  skipped, scope: 'available_local_git_refs_and_nonignored_working_tree', uploads: false };
// Paths and object IDs remain local; no matched content is ever written.
if (!process.env.CI) {
  await mkdir(resolve(root, 'secrets'), { recursive: true });
  await writeFile(resolve(root, 'secrets/repository-audit.json'), JSON.stringify({ summary, findings, privateFiles, historyPaths }, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
if (findings.length || privateFiles.length || historyPaths.length) process.exitCode = 1;
