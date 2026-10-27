import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '../..');
function ignored(paths) {
  const result = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
    cwd, input: paths.join('\0') + '\0', encoding: 'utf8',
  });
  assert.ok(result.status === 0 || result.status === 1, result.stderr || String(result.error));
  return result.stdout.split('\0').filter(Boolean);
}

test('Git tracks no ignored private files or generated artifacts', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.deepEqual(ignored(tracked), []);
});

test('private outputs are ignored while runtime assets and safe templates remain publishable', () => {
  const privatePaths = ['captures/photo.png', 'data/dataset.csv', 'models/pose_model.joblib',
    'models/labels.json', 'models/another-trained-model.pkl', 'docs/ui-preview/frame.png',
    'docs_preview.png', '.ecc/benchmarks/result.json', '.env', '.env.production',
    'web/.env.local', '.aws/credentials', '.ssh/id_ed25519', '.codex/state.json',
    '.agents/session.json', '.npmrc', 'credentials-production.json', 'service-account-prod.json',
    'secrets/config.json', 'signing.key', 'client.p12', 'private.pem', 'browser.har',
    'photo.print.html', '.venv/pyvenv.cfg', 'node_modules/example/index.js',
    'dist/index.html', 'test-results/trace.zip', 'playwright-report/index.html'];
  assert.deepEqual(ignored(privatePaths), privatePaths);
  assert.deepEqual(ignored(['.env.example', '.env.sample', 'package-lock.json', 'config/settings.yaml',
    'models/hand_landmarker.task', 'models/face_landmarker.task', 'web/memes/idea.webp',
    'web/app.js', '.github/workflows/checks.yml', 'tests/web/repository.test.mjs']), []);
});
