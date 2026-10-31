import { test, expect } from '@playwright/test';

async function camera(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aktifkan kamera', exact: true }).click();
  await expect(page.locator('#camera-state')).toHaveText('KAMERA AKTIF');
  await expect(page.locator('#video')).toHaveJSProperty('readyState', 4);
}

async function manualStudio(page) {
  await camera(page);
  await page.keyboard.press('m');
  await page.locator('#mode-nav [data-mode=free]').click();
}

test('camera capture, download and Print use the selected saved image', async ({ page }) => {
  await manualStudio(page);
  await page.keyboard.press('s');
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await page.keyboard.press('s');
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await page.locator('#gallery-toggle').click();
  await page.locator('#gallery-next').click();
  const card = page.locator('.photo-card').last();
  await expect(card).toBeVisible();
  const saved = await card.locator('img').getAttribute('src');
  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('link', { name: 'Unduh PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printed = 'yes'; }; });
  await card.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'yes');
  await expect(page.locator('#print-area img')).toHaveAttribute('src', saved);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('main')).toBeHidden();
  await expect(page.locator('#print-area img')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#gallery-close').click();
  await page.keyboard.press('x');
  await page.locator('#gallery-toggle').click();
  await expect(card.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
});

test('real MediaPipe worker initializes from same-origin files', async ({ page, baseURL }) => {
  const failures = [];
  const external = [];
  page.on('pageerror', error => failures.push(error.message));
  const origin = new URL(baseURL).origin;
  page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) external.push(request.url()); });
  await camera(page);
  await expect(page.locator('#tracking-state')).not.toContainText('Menyiapkan', { timeout: 45000 });
  await expect(page.locator('#tracking-state')).not.toContainText('belum tersedia');
  await expect(page.locator('#tracking-state')).toContainText(/tangan|Gestur siap/, { timeout: 45000 });
  expect(failures).toEqual([]);
  expect(external).toEqual([]);
});

test('denied camera access leaves an actionable retry', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Aktifkan kamera', exact: true }).click();
  await expect(page.locator('#feedback')).toContainText('Izin kamera ditolak');
  await expect(page.locator('#start-camera')).toBeEnabled();
  await expect(page.locator('.photo-card')).toHaveCount(0);
});

test('photobooth captures exactly three frames into a printable strip', async ({ page }) => {
  await manualStudio(page);
  await page.locator('#mode-nav [data-mode=photobooth]').click();
  await page.keyboard.press('s');
  await expect(page.locator('#countdown')).toBeVisible();
  await expect(page.locator('.photo-card')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#saved-section')).toBeVisible();
  const dimensions = await page.locator('.photo-card img').evaluate(img => ({ w: img.naturalWidth, h: img.naturalHeight }));
  expect(dimensions.h).toBeGreaterThan(dimensions.w);
  await expect(page.locator('#countdown')).toBeHidden();
});

test('mobile workspace fits and preserves keyboard/native controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await manualStudio(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#mode-nav [data-mode=painting]').click();
  await expect(page.locator('#paint-tools')).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Photobooth');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('#tutorial-open').evaluate(button => getComputedStyle(button).transitionDuration)).toBe('0s');
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: 'docs/ui-preview/web-mobile.png', fullPage: true });
});

test('build serves security headers and does not publish private workspace files', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['content-security-policy']).toContain("connect-src 'self'");
  expect(response.headers()['content-security-policy']).toContain("form-action 'self'");
  expect(response.headers()['content-security-policy']).toContain("frame-src 'none'");
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['cross-origin-resource-policy']).toBe('same-origin');
  expect(response.headers()['permissions-policy']).toContain('microphone=()');
  for (const path of ['/captures/example.png', '/.env', '/.env.local', '/secrets/supabase-project-setup.json', '/.git/config', '/.venv/pyvenv.cfg', '/server/config.mjs', '/core/pipeline.py']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
