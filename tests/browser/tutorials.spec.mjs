import { test, expect } from '@playwright/test';
import { fakeVision, pose, hand } from './fixtures.mjs';

// Fresh preferences exercise default onboarding; other suites exercise opted-out workflows.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => { await fakeVision(page, { tutorials: true }); });

test('fresh menu and each new mode open the matching tutorial; skip and Escape restore the studio', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tutorial-dialog')).toBeHidden();
  await page.keyboard.press('m');
  await expect(page.locator('#tutorial-dialog')).toBeVisible();
  await expect(page.locator('#tutorial-title')).toHaveText('Mulai di sini');
  await expect(page.locator('#tutorial-skip')).toBeFocused();
  await page.locator('#tutorial-skip').click();
  for (const mode of ['free', 'painting', 'photobooth', 'meme']) {
    await page.locator(`#mode-nav [data-mode=${mode}]`).click();
    await expect(page.locator('#tutorial-dialog')).toBeVisible();
    await expect(page.locator(`#tutorial-dialog [data-tutorial=${mode}]`)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tutorial-dialog')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-mode', mode);
  }
  await expect(page.locator('.photo-card')).toHaveCount(0);
});

test('auto preference survives reload; manual library remains available and can enable it again', async ({ page }) => {
  await page.goto('/'); await page.locator('#tutorial-open').click();
  await page.getByRole('switch', { name: 'Tutorial otomatis' }).click();
  await expect(page.locator('#tutorial-auto')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#tutorial-skip').click(); await page.reload();
  await page.keyboard.press('m');
  await expect(page.locator('#menu-screen')).toBeVisible();
  await expect(page.locator('#tutorial-dialog')).toBeHidden();
  await page.locator('#mode-nav [data-mode=painting]').click();
  await expect(page.locator('#tutorial-dialog')).toBeHidden();
  await page.locator('#tutorial-open').click();
  await expect(page.locator('#tutorial-title')).toHaveText('Painting');
  await page.locator('#tutorial-auto').click(); await page.locator('#tutorial-close').click();
  await page.locator('#mode-nav [data-mode=meme]').click();
  await expect(page.locator('#tutorial-title')).toHaveText('Meme');
  await expect(page.locator('#tutorial-dialog')).toBeVisible();
});

test('five local MP4s decode; chapter selection seeks, tracks stay local, and closed videos stop', async ({ page, request }) => {
  const range = await request.get('/tutorials/menu.mp4', { headers: { Range: 'bytes=0-31' } });
  expect(range.status()).toBe(206); expect((await range.body()).length).toBe(32);
  expect(range.headers()['accept-ranges']).toBe('bytes');
  expect((await request.get('/tutorials/menu.mp4', { headers: { Range: 'bytes=999999999999-' } })).status()).toBe(416);
  const media = [], external = [], failures = [];
  page.on('request', request => { if (/tutorials\/.*\.(mp4|jpg|vtt)/.test(request.url())) media.push(request.url()); if (!request.url().startsWith('http://127.0.0.1:4174') && !request.url().startsWith('blob:')) external.push(request.url()); });
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/'); expect(media).toEqual([]);
  await page.locator('#tutorial-open').click();
  for (const id of ['menu', 'free', 'painting', 'photobooth', 'meme']) {
    await page.locator(`[data-tutorial=${id}]`).click();
    await expect(page.locator('#tutorial-video')).toHaveJSProperty('readyState', 4);
    const size = await page.locator('#tutorial-video').evaluate(v => ({ w: v.videoWidth, h: v.videoHeight, duration: v.duration, muted: v.muted }));
    expect(size.w).toBe(960); expect(size.h).toBe(540); expect(size.duration).toBeCloseTo(12, 1); expect(size.muted).toBe(true);
    await page.locator('#tutorial-chapters button').nth(2).click();
    await expect.poll(() => page.locator('#tutorial-video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(6);
    await expect(page.locator('#tutorial-step')).not.toBeEmpty();
  }
  await page.locator('#tutorial-close').click();
  await expect(page.locator('#tutorial-video')).toHaveJSProperty('paused', true);
  await expect(page.locator('#tutorial-video')).not.toHaveAttribute('src');
  await expect(page.locator('#tutorial-open')).toBeFocused();
  expect(failures).toEqual([]); expect(external).toEqual([]);
});

test('reduced motion shows a paused poster; storage denial still permits skip and in-memory settings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await page.goto('/'); await page.locator('#tutorial-open').click();
  await expect(page.locator('#tutorial-video')).toHaveJSProperty('paused', true);
  await expect(page.locator('#tutorial-video')).toHaveAttribute('poster', 'tutorials/menu.jpg');
  await page.locator('#tutorial-auto').click(); await page.locator('#tutorial-skip').click();
  await expect(page.locator('#tutorial-dialog')).toBeHidden();
  await page.keyboard.press('m'); await expect(page.locator('#menu-screen')).toBeVisible();
  await expect(page.locator('#tutorial-dialog')).toBeHidden();
});

test('failed media leaves readable chapters, skip and retry; retry recovers', async ({ page }) => {
  await page.route('**/tutorials/*.mp4', route => route.abort());
  await page.goto('/'); await page.locator('#tutorial-open').click();
  await expect(page.locator('#tutorial-media-status')).toBeVisible();
  await expect(page.locator('#tutorial-step')).not.toBeEmpty();
  await page.locator('#tutorial-chapters button').last().click();
  await expect(page.locator('#tutorial-step')).toContainText('Tekan S');
  await page.unroute('**/tutorials/*.mp4'); await page.locator('#tutorial-retry').click();
  await expect(page.locator('#tutorial-video')).toHaveJSProperty('readyState', 4);
  await expect(page.locator('#tutorial-media-status')).toBeHidden();
  await page.locator('#tutorial-skip').click();
  await expect(page.locator('#tutorial-dialog')).toBeHidden();
});

test('tutorial never triggers a held photobooth fist or Space shortcut; session blocks opening another tutorial', async ({ page }) => {
  await page.goto('/'); await page.keyboard.press('m');
  await page.locator('#tutorial-skip').click();
  await page.locator('#mode-nav [data-mode=photobooth]').click();
  await pose(page, [hand('fist')]); await page.locator('#tutorial-video').focus(); await page.keyboard.press('Space'); await page.waitForTimeout(700);
  await expect(page.locator('#countdown')).toBeHidden(); await expect(page.locator('.photo-card')).toHaveCount(0);
  await page.locator('#tutorial-skip').click(); await page.waitForTimeout(700);
  await expect(page.locator('#countdown')).toBeHidden();
  await pose(page, [hand('open')]); await page.waitForTimeout(150); await pose(page, [hand('fist')]);
  await expect(page.locator('#countdown')).toBeVisible();
  await page.locator('#tutorial-open').click(); await expect(page.locator('#tutorial-dialog')).toBeHidden();
  await page.keyboard.press('Escape');
});

test('dialog fits phones, tablets and short landscape; keyboard focus stays inside the modal', async ({ page }) => {
  await page.goto('/'); await page.locator('#tutorial-open').click();
  for (const [width, height] of [[320,568],[390,844],[568,320],[844,390],[768,900],[1440,900]]) {
    await page.setViewportSize({width,height});
    const bounds = await page.locator('#tutorial-dialog').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    const outside = await page.locator('#tutorial-dialog').evaluate(dialog => [...dialog.querySelectorAll('button,video')].filter(e => {
      if(!e.getClientRects().length) return false;
      const a=e.getBoundingClientRect(), b=dialog.getBoundingClientRect();
      return a.top<b.top || a.bottom>b.bottom || a.left<b.left || a.right>b.right;
    }).map(e=>e.id));
    expect(outside,`${width}x${height}`).toEqual([]);
    await expect(page.locator('#tutorial-skip')).toBeInViewport(); await expect(page.locator('#tutorial-auto')).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  }
  for(let i=0;i<18;i++){
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>!!document.activeElement.closest('#tutorial-dialog'))).toBe(true);
  }
  await page.keyboard.press('Escape'); await expect(page.locator('#tutorial-open')).toBeFocused();
});
