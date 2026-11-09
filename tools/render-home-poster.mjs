import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:4174');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && origin.protocol === 'http:', 'Use the local preview server');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  await page.goto(origin.origin);
  await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'ready', { timeout: 20000 });
  await expect(page.locator('body')).toHaveAttribute('data-home-motion', 'paused', { timeout: 15000 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--bg', 'transparent');
    [...document.styleSheets].find(sheet => sheet.href?.endsWith('/styles.css')).insertRule('.stage::before{display:none}');
  });
  const image = await page.screenshot({ clip: await page.locator('#home-art').boundingBox(), omitBackground: true });
  const poster = await sharp(image).webp({ quality: 92 }).toBuffer();
  const info = await sharp(poster).metadata();
  assert.ok(info.hasAlpha && info.width === 560 && info.height === 420 && poster.length <= 120 * 1024, 'Poster must be a transparent, bounded 560x420 WebP');
  await writeFile(new URL('../web/home-mascot.webp', import.meta.url), poster);
  console.log(`Original 3D poster rendered: ${info.width}x${info.height}, ${poster.length} bytes`);
  for (const [name, x, y] of [['mint', .18, .32], ['star', .82, .29], ['ticket', .8, .73], ['ribbon', .19, .73]]) {
    const image = await page.screenshot({ clip: { x: x * 1440 - 80, y: y * 900 - 80, width: 160, height: 160 }, omitBackground: true });
    const asset = await sharp(image).webp({ quality: 92 }).toBuffer();
    const metadata = await sharp(asset).metadata();
    assert.ok(metadata.hasAlpha && metadata.width === 320 && metadata.height === 320 && asset.length < 40 * 1024, 'Decoration must be a bounded transparent 3D render');
    await writeFile(new URL(`../web/home-${name}.webp`, import.meta.url), asset);
    console.log(`Original 3D decoration rendered: ${name}, ${asset.length} bytes`);
  }
} finally { await browser.close(); }
