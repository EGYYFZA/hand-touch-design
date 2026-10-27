import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, access, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test('rebuilding removes stale files and publishes only the web allowlist', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const stale = resolve(root, 'dist/captures/private-fixture.txt');
  await mkdir(resolve(root, 'dist/captures'), { recursive: true });
  await writeFile(stale, 'synthetic test fixture, not a real capture');
  execFileSync(process.execPath, ['tools/build-web.mjs'], { cwd: root });
  await assert.rejects(access(stale), { code: 'ENOENT' });
  await access(resolve(root, 'dist/index.html'));
  await access(resolve(root, 'dist/models/hand_landmarker.task'));
  for (const meme of ['clingy', 'idea', 'shock', 'tongue']) await access(resolve(root, `dist/memes/${meme}.webp`));
  const published = await readdir(resolve(root, 'dist'));
  for (const privateName of ['captures', '.env', '.git', '.venv', '.local-assets', 'core']) {
    assert.equal(published.includes(privateName), false, privateName);
  }
});
