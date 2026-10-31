import { test, expect } from '@playwright/test';

async function takePhoto(page) {
  await page.goto('/');
  await page.keyboard.press('m');
  await page.locator('#mode-nav [data-mode=free]').click();
  await page.keyboard.press('s');
  await expect(page.locator('.photo-card')).toHaveCount(1);
}

test('photo survives reload, stays out of another browser profile, and deletion survives reload', async ({ page, browser }) => {
  const uploads = [];
  page.on('request', request => { if (request.method() !== 'GET') uploads.push(request.url()); });
  await takePhoto(page);
  await expect(page.locator('#feedback')).toContainText('Foto tersimpan di browser');
  await page.reload();
  await expect(page.locator('#photo-count')).toHaveText('1');
  await expect(page.locator('#camera-state')).toHaveText('KAMERA OFF');
  await page.locator('#gallery-toggle').click();
  const image = page.locator('.photo-card img');
  expect(await image.evaluate(async img => { await img.decode(); return img.naturalWidth; })).toBeGreaterThan(0);
  const other = await browser.newContext();
  try {
    const isolated = await other.newPage(); await isolated.goto(new URL(page.url()).origin);
    await expect(isolated.locator('#gallery-toggle')).toBeDisabled();
    expect(await isolated.evaluate(async () => (await import('/photo-store.js')).listPhotos().then(items => items.length))).toBe(0);
  } finally { await other.close(); }
  await page.getByRole('button', { name: 'Hapus', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, hapus', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#gallery-toggle')).toBeDisabled();
  expect(uploads).toEqual([]);
});

test('storage denial preserves download and warns that the photo is temporary', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await takePhoto(page);
  await expect(page.locator('#feedback')).toContainText('Foto hanya sementara');
  await page.locator('#gallery-toggle').click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Unduh PNG' }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.png$/);
});

test('local photo budget rejects concurrent overflow without evicting existing photos', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-local-demo', 'true');
  const result = await page.evaluate(async () => {
    const { storePhoto, listPhotos, deletePhoto, MAX_PHOTOS, MAX_LOCAL_BYTES } = await import('/photo-store.js');
    const make = id => ({ id, createdAt: Date.now(), kind: 'free', name: 'synthetic.png', blob: new Blob(['synthetic fixture'], { type: 'image/png' }) });
    const writes = await Promise.allSettled(Array.from({ length: MAX_PHOTOS + 2 }, (_, i) => storePhoto(make(String(i)))));
    const saved = await listPhotos();
    await Promise.all(saved.map(photo => deletePhoto(photo.id)));
    const large = make('large'); large.blob = new Blob([new Uint8Array(MAX_LOCAL_BYTES + 1)], { type: 'image/png' });
    let rejected = false; try { await storePhoto(large); } catch { rejected = true; }
    return { fulfilled: writes.filter(write => write.status === 'fulfilled').length, count: saved.length, rejected, remaining: (await listPhotos()).length };
  });
  expect(result).toEqual({ fulfilled: 12, count: 12, rejected: true, remaining: 0 });
});
