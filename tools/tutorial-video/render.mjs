import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tutorials } from '../../web/tutorial-catalog.js';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'web/tutorials');
await mkdir(output, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve(import.meta.dirname, 'index.jsx'), publicDir: null });
const selected = process.argv.slice(2);
const modes = selected.length ? selected : Object.keys(tutorials);
const chromiumOptions = { gl: 'angle' };
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || chromium.executablePath();
const armBinaries = resolve(root, '.cache/tutorial-compositor/package');
const binariesDirectory = process.env.REMOTION_BINARIES_DIR || (process.platform === 'win32' && process.arch === 'arm64' && existsSync(armBinaries) ? armBinaries : undefined);
const manifest = { generator: 'Remotion 4.0.539 / ThreeCanvas', dimensions: [960, 540], fps: 20, audio: false, clips: {} };
try { manifest.clips = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')).clips || {}; } catch { /* First render. */ }
for (const mode of modes) {
  if (!tutorials[mode]) throw new Error('Unknown tutorial');
  const composition = await selectComposition({ serveUrl, id: mode, chromiumOptions, browserExecutable, binariesDirectory });
  console.log(`Rendering ${mode} (${composition.durationInFrames} frames)`);
  let percent = -1;
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: resolve(output, `${mode}.mp4`), crf: 27, pixelFormat: 'yuv420p', muted: true, concurrency: 2, chromiumOptions, browserExecutable, binariesDirectory,
    onProgress: progress => { const next = Math.floor(progress.progress * 4); if (next !== percent) { percent = next; console.log(`${mode}: ${Math.round(progress.progress * 100)}%`); } },
  });
  await renderStill({ composition, serveUrl, output: resolve(output, `${mode}.jpg`), frame: 25, imageFormat: 'jpeg', chromiumOptions, browserExecutable, binariesDirectory });
  const timestamp = seconds => `00:00:${String(seconds).padStart(2, '0')}.000`;
  await writeFile(resolve(output, `${mode}.vtt`), 'WEBVTT\n\n' + tutorials[mode].steps.map((step, i, all) => `${timestamp(step.at)} --> ${timestamp(all[i + 1]?.at || 12)}\n${step.title}. ${step.detail}\n`).join('\n'));
  const data = await readFile(resolve(output, `${mode}.mp4`));
  manifest.clips[mode] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), seconds: 12 };
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Tutorial videos rendered locally; no camera footage or remote assets used.');
