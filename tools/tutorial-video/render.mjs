import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tutorials } from '../../web/tutorial-catalog.js';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { inspectTutorials } from './inspect.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'web/tutorials');
const staging = resolve(root, '.cache/tutorial-render');
await mkdir(output, { recursive: true });
await mkdir(staging, { recursive: true });
await inspectTutorials();
const serveUrl = await bundle({ entryPoint: resolve(import.meta.dirname, 'index.jsx'), publicDir: resolve(root, 'web/fonts') });
const stills = process.argv.includes('--stills');
const selected = process.argv.slice(2).filter(argument => argument !== '--stills');
const modes = selected.length ? selected : Object.keys(tutorials);
const chromiumOptions = { gl: 'angle' };
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || chromium.executablePath();
const armBinaries = resolve(root, '.cache/tutorial-compositor/package');
const binariesDirectory = process.env.REMOTION_BINARIES_DIR || (process.platform === 'win32' && process.arch === 'arm64' && existsSync(armBinaries) ? armBinaries : undefined);
const manifest = { generator: 'Remotion 4.0.539 / ThreeCanvas / EGZ mascot guide', dimensions: [960, 540], fps: 30, audio: false, clips: {} };
try { manifest.clips = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')).clips || {}; } catch { /* First render. */ }
const puppeteerInstance = await openBrowser('chrome', { browserExecutable, chromiumOptions });
try {
for (const mode of modes) {
  if (!tutorials[mode]) throw new Error('Unknown tutorial');
  const composition = await selectComposition({ serveUrl, id: mode, chromiumOptions, browserExecutable, binariesDirectory, puppeteerInstance });
  if (stills) {
    const preview = resolve(root, 'docs/ui-preview/tutorial-revamp');
    await mkdir(preview, { recursive: true });
    for (const frame of [45, 135, 225, 315]) {
      await renderStill({ composition, serveUrl, output: resolve(preview, `${mode}-${frame}.jpg`), frame, imageFormat: 'jpeg', puppeteerInstance, binariesDirectory });
    }
    console.log(`${mode}: four chapter previews rendered`);
    continue;
  }
  console.log(`Rendering ${mode} (${composition.durationInFrames} frames)`);
  let percent = -1;
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: resolve(staging, `${mode}.mp4`), crf: 27, pixelFormat: 'yuv420p', muted: true, concurrency: 2, chromiumOptions, browserExecutable, binariesDirectory, puppeteerInstance,
    onProgress: progress => { const next = Math.floor(progress.progress * 4); if (next !== percent) { percent = next; console.log(`${mode}: ${Math.round(progress.progress * 100)}%`); } },
  });
  await renderStill({ composition, serveUrl, output: resolve(staging, `${mode}.jpg`), frame: 25, imageFormat: 'jpeg', chromiumOptions, browserExecutable, binariesDirectory, puppeteerInstance });
  const timestamp = seconds => `00:00:${String(seconds).padStart(2, '0')}.000`;
  await writeFile(resolve(staging, `${mode}.vtt`), 'WEBVTT\n\n' + tutorials[mode].steps.map((step, i, all) => `${timestamp(step.at)} --> ${timestamp(all[i + 1]?.at || 12)}\n${step.title}. ${step.detail}\n`).join('\n'));
  const data = await readFile(resolve(staging, `${mode}.mp4`));
  manifest.clips[mode] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), seconds: 12 };
}
if (!stills) {
  for (const mode of modes) for (const extension of ['mp4', 'jpg', 'vtt']) await copyFile(resolve(staging, `${mode}.${extension}`), resolve(output, `${mode}.${extension}`));
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
} finally { await puppeteerInstance.close({ silent: true }); }
console.log('Tutorial videos rendered locally; no camera footage or remote assets used.');
