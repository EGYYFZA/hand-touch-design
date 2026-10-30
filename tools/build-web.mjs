import { cp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
if (relative(root, output) !== 'dist') throw new Error('Build output must be the workspace dist directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Publish explicit public source files; never recursively copy a source folder
// that may also contain local credentials, captures, or editor output.
const publicFiles = ['index.html', 'privacy.html', 'theme.css', 'styles.css', 'motion.css', 'home-motion.js', 'icon.svg', 'app.js', 'photo-strip.js', 'fonts/mona-sans.woff2',
  'gestures.js', 'vision-worker.js', 'photo-store.js', 'photo-preview.js', 'device-profile.js',
  'cloud-client.js', 'account.html', 'account.js', 'account.css', 'admin.html',
  'cloud-gallery.html', 'cloud-gallery.js', 'cloud-viewer.js', 'studio-cloud.js', 'studio-cloud.css',
  ...['clingy', 'idea', 'shock', 'tongue'].map(name => `memes/${name}.webp`)];
for (const name of publicFiles) {
  await mkdir(resolve(output, name, '..'), { recursive: true });
  await copyFile(resolve(root, 'web', name), resolve(output, name));
}
await mkdir(resolve(output, 'vendor/wasm'), { recursive: true });
await copyFile(resolve(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'), resolve(output, 'vendor/vision_bundle.mjs'));
await cp(resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm'), resolve(output, 'vendor/wasm'), { recursive: true });
await mkdir(resolve(output, 'models'), { recursive: true });
for (const name of ['hand_landmarker.task', 'face_landmarker.task']) {
  await copyFile(resolve(root, 'models', name), resolve(output, 'models', name));
}
for (const name of ['LICENSE', 'THIRD_PARTY.md', 'licenses/Apache-2.0.txt', 'licenses/Mona-Sans-OFL.txt']) {
  await mkdir(resolve(output, name, '..'), { recursive: true });
  await copyFile(resolve(root, name), resolve(output, name));
}
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const headers = JSON.parse(await readFile(resolve(root, 'config/security-headers.json'), 'utf8'));
await writeFile(resolve(output, '_headers'), '/*\n' + Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`).join('\n') + '\n');
if (!html.includes('app.js') || html.includes('http://')) throw new Error('Invalid web entry point');
console.log('Static browser app built in dist/; camera captures are excluded.');
