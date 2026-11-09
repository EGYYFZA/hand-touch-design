import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fakeVision } from './fixtures.mjs';

test('public photobooth previews and downloads the original PNG without accounts, watermark or cloud requests', async ({ page }) => {
  await fakeVision(page);
  const accountRequests = [];
  await page.route('**/api/studio**', route => { accountRequests.push(route.request().url()); return route.abort(); });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-local-only', 'true');
  await expect(page.locator('#account-open')).toHaveCount(0);
  await page.keyboard.press('m'); await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.keyboard.press('s');
  await expect(page.locator('#saved-section')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.photo-card')).toHaveCount(1);
  const original = await page.locator('.photo-card img').evaluate(async img => {
    await img.decode();
    const [photo] = await (await import('/photo-store.js')).listPhotos();
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    const bitmap = await createImageBitmap(photo.blob), canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const previewHash = await hash(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return { owner: photo.ownerId, consent: photo.cloudConsentAtCapture, previewHash,
      originalPixelsHash: await hash(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
      originalHash: await hash(await photo.blob.arrayBuffer()), bytes: photo.blob.size,
      width: canvas.width, height: canvas.height, previewWidth: img.naturalWidth, previewHeight: img.naturalHeight };
  });
  expect(original.owner).toBe('guest'); expect(original.consent).toBe(false);
  expect(original.previewWidth).toBe(original.width); expect(original.previewHeight).toBe(original.height);
  expect(original.previewHash).toBe(original.originalPixelsHash);
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Unduh PNG' }).click();
  const download = await pending, bytes = await readFile(await download.path());
  expect(download.suggestedFilename()).toMatch(/photobooth.*\.png$/);
  expect(bytes.length).toBe(original.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(original.originalHash);
  await expect(page.locator('#studio-account')).toBeHidden();
  await expect(page.locator('.cloud-upload')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#photo-count')).toHaveText('1');
  await page.locator('#gallery-toggle').click(); await expect(page.locator('.photo-card img')).toBeVisible();
  expect(accountRequests).toEqual([]);
});

test('local-only gallery excludes old account and legacy caches and remains isolated between browser profiles', async ({ page, browser }) => {
  const accountOwner = '11111111-1111-4111-8111-111111111111';
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-local-only', 'true');
  await page.evaluate(async owner => {
    const store = await import('/photo-store.js');
    const blob = await new Promise(resolve => document.createElement('canvas').toBlob(resolve, 'image/png'));
    for (const [id, ownerId] of [['old-account', owner], ['legacy', null], ['my-free-photo', 'guest']]) {
      await store.storePhoto({ id, ownerId, name: id + '.png', kind: 'photobooth', createdAt: Date.now(), blob }, ownerId);
    }
    localStorage.setItem('egz-cache-owner', owner);
  }, accountOwner);
  await page.reload(); await expect(page.locator('#photo-count')).toHaveText('1');
  await page.locator('#gallery-toggle').click(); await expect(page.locator('.photo-card')).toContainText('my-free-photo.png');
  await expect(page.locator('.photo-card')).not.toContainText('old-account');
  const other = await browser.newContext();
  try {
    const isolated = await other.newPage(); await isolated.goto(new URL(page.url()).origin);
    await expect(isolated.locator('body')).toHaveAttribute('data-local-only', 'true');
    await expect(isolated.locator('#photo-count')).toHaveText('0');
    await expect(isolated.locator('#gallery-toggle')).toBeDisabled();
  } finally { await other.close(); }
  expect(await page.evaluate(async owner => {
    const store = await import('/photo-store.js'); store.setPhotoOwner(owner);
    const count = (await store.listPhotos()).length; store.setPhotoOwner('guest'); return count;
  }, accountOwner)).toBe(1);
});
