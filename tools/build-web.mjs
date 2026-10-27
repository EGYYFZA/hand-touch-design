import { cp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
if (relative(root, output) !== 'dist') throw new Error('Build output must be the workspace dist directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'web'), output, { recursive: true });
await mkdir(resolve(output, 'vendor/wasm'), { recursive: true });
await copyFile(resolve(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'), resolve(output, 'vendor/vision_bundle.mjs'));
await cp(resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm'), resolve(output, 'vendor/wasm'), { recursive: true });
await mkdir(resolve(output, 'models'), { recursive: true });
for (const name of ['hand_landmarker.task', 'face_landmarker.task']) {
  await copyFile(resolve(root, 'models', name), resolve(output, 'models', name));
}
for (const name of ['LICENSE', 'THIRD_PARTY.md', 'licenses/Apache-2.0.txt']) {
  await mkdir(resolve(output, name, '..'), { recursive: true });
  await copyFile(resolve(root, name), resolve(output, name));
}
const html = await readFile(resolve(output, 'index.html'), 'utf8');
if (!html.includes('app.js') || html.includes('http://')) throw new Error('Invalid web entry point');
console.log('Static browser app built in dist/; camera captures are excluded.');
