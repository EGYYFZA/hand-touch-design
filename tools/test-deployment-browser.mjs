// Guest-only acceptance on an authorized HTTPS deployment, using a fake camera.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Provide the exact authorized HTTPS origin');
const checks = [], errors = [], external = [], uploads = [];
const check = (name, value = true) => { assert.ok(value, name); checks.push(name); };
const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) external.push(new URL(request.url()).hostname);
    if (request.url().includes('action=upload')) uploads.push(request.method());
  });
  await page.goto(origin + '/'); await page.locator('#manual-access').click();
  await expect(page.locator('#tracking-state')).toContainText(/tangan|Gestur siap/, { timeout: 45000 });
  check('real MediaPipe worker and hand model load under deployed CSP');
  await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.locator('#capture').click();
  await expect(page.locator('#saved-section')).toBeVisible({ timeout: 25000 });
  check('guest photobooth automatically opens its completed three-shot result');
  const preview = await page.locator('.photo-card img').evaluate(async img => { await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight, alt: img.alt, src: img.src }; });
  check('guest result is a reduced watermarked preview', Math.max(preview.w, preview.h) <= 960 && preview.alt.includes('pratinjau'));
  await page.evaluate(() => { window.print = () => document.documentElement.dataset.printed = 'yes'; });
  await page.getByRole('button', { name: 'Print', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-printed', 'yes');
  check('guest Print uses the same preview', await page.locator('#print-area img').getAttribute('src') === preview.src);
  let downloads = 0; page.on('download', () => { downloads++; });
  await page.getByRole('link', { name: 'Unduh PNG' }).click(); await expect(page.locator('#studio-account')).toBeVisible();
  check('official download opens inline login without exporting first', downloads === 0);
  await page.locator('#studio-account-close').click(); await page.locator('#gallery-close').click();
  for (const mode of ['free', 'painting', 'meme']) { await page.locator(`#mode-nav [data-mode=${mode}]`).click(); await expect(page.locator('body')).toHaveAttribute('data-mode', mode); }
  check('all modes remain reachable without login');
  for (const [width, height] of [[390,844], [844,390], [1366,768]]) {
    await page.setViewportSize({ width, height });
    check(`deployed workspace has no page scroll at ${width}x${height}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
  }
  check('guest captures never upload to cloud', uploads.length === 0);
  check('runtime assets stay on the site origin', external.length === 0);
  check('no uncaught page errors', errors.length === 0);
  await context.close();
  console.log(JSON.stringify({ origin, passed: checks.length, checks }, null, 2));
} finally { await browser.close(); }
