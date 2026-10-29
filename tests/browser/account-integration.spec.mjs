import { test, expect } from '@playwright/test';
import { fakeVision } from './fixtures.mjs';

const UID_A = '11111111-1111-4111-8111-111111111111';
const UID_B = '22222222-2222-4222-8222-222222222222';
const PHOTO = '33333333-3333-4333-8333-333333333333';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';

async function mockAccount(page, state) {
  const requests = [];
  await page.route('**/api/studio?**', async route => {
    const request = route.request(); const url = new URL(request.url()); const action = url.searchParams.get('action');
    requests.push({ action, method: request.method(), csrf: request.headers()['x-csrf-token'], bytes: request.postDataBuffer()?.byteLength || 0 });
    const reply = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (action === 'session') return reply({ configured: true, user: state.user || null, csrfToken: 'csrf-fixture', consent: { active: !!state.consent, version: '2026-10-29' }, isAdmin: !!state.admin, mfaRequired: !!state.mfaRequired });
    if (action === 'logout') { state.user = null; return reply({ success: true }); }
    if (action === 'consent') { state.consent = request.postDataJSON().granted; return reply({ consent: { active: state.consent } }); }
    if (action === 'photos' || action === 'admin-photos') return reply({ photos: state.photos || [], nextCursor: null });
    if (action === 'photo') return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG, 'base64') });
    if (action === 'upload') return reply({ photo: { id: request.headers()['x-photo-id'], expires_at: new Date(Date.now() + 30 * 86400000).toISOString() } });
    if (action === 'remove') {
      if (state.expired) { state.user = null; return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Sesi berakhir.' }) }); }
      state.photos = []; return reply({ success: true });
    }
    if (action === 'login') {
      if (state.loginError) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Email atau password salah.' }) });
      state.user = { id: UID_A, email: 'synthetic@example.test' }; return reply({ success: true });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unsupported fixture action' }) });
  });
  return requests;
}

test('guest photobooth works before login, preserves photos, and resumes download after inline login', async ({ page }) => {
  await fakeVision(page);
  const state = { user: null, loginError: true };
  const requests = await mockAccount(page, state);
  await page.goto('/'); await expect(page).toHaveURL(/\/$/);
  await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.locator('#capture').click();
  await expect(page.locator('.photo-card')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('#saved-section')).toBeVisible();
  expect(requests.some(item => item.action === 'login' || item.action === 'upload')).toBe(false);
  const preview = await page.locator('.photo-card img').evaluate(async img => { await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight }; });
  expect(Math.max(preview.w, preview.h)).toBeLessThanOrEqual(960);
  const original = await page.evaluate(async () => {
    const photo = (await (await import('/photo-store.js')).listPhotos())[0];
    const image = await createImageBitmap(photo.blob); const size = { w: image.width, h: image.height }; image.close(); return size;
  });
  expect(original.h).toBeGreaterThan(preview.h);
  await page.reload(); await expect(page.locator('#photo-count')).toHaveText('1'); await page.locator('#gallery-toggle').click();
  await page.getByRole('link', { name: 'Unduh PNG' }).click();
  await expect(page.locator('#studio-account')).toBeVisible(); await expect(page.locator('#studio-email')).toBeFocused();
  await page.locator('#studio-email').fill('synthetic@example.test'); await page.locator('#studio-password').fill('synthetic password');
  await page.locator('#studio-login-form').getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.locator('#studio-account-status')).toContainText('password salah');
  state.loginError = false; await page.locator('#studio-password').fill('synthetic password');
  const pending = page.waitForEvent('download');
  await page.locator('#studio-login-form').getByRole('button', { name: 'Masuk', exact: true }).click();
  const download = await pending; expect(download.suggestedFilename()).toMatch(/photobooth.*\.png$/);
  await expect(page).toHaveURL(/\/$/); await expect(page.locator('#studio-account')).toBeHidden();
  await expect(page.locator('#photo-count')).toHaveText('1');
  const adopted = await page.evaluate(async () => { const store = await import('/photo-store.js'); const own = await store.listPhotos(); store.setPhotoOwner('guest'); const guest = await store.listPhotos(); store.setPhotoOwner(own[0].ownerId); return { own: own.map(p => ({ owner: p.ownerId, consent: p.cloudConsentAtCapture })), guest: guest.length }; });
  expect(adopted).toEqual({ own: [{ owner: UID_A, consent: false }], guest: 0 });
  const size = await page.locator('.photo-card img').evaluate(async img => { await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight }; });
  expect(size).toEqual(original); expect(requests.filter(item => item.action === 'upload')).toHaveLength(0);
});

test('account cache hides legacy photos, scopes owner data, and clears cache on logout', async ({ page }) => {
  const state = { user: { id: UID_A, email: 'a@example.test' }, consent: false };
  const requests = await mockAccount(page, state);
  await page.goto('/'); await expect(page.locator('#account-open')).toBeVisible();
  await page.evaluate(async ({ a, b }) => {
    const store = await import('/photo-store.js');
    const photo = id => ({ id, name: `${id}.png`, kind: 'free', createdAt: Date.now(), blob: new Blob(['synthetic'], { type: 'image/png' }) });
    store.setPhotoOwner(null); await store.storePhoto(photo('legacy'));
    store.setPhotoOwner(a); await store.storePhoto({ ...photo('account-a'), ownerId: a });
    store.setPhotoOwner(b); await store.storePhoto({ ...photo('account-b'), ownerId: b });
    store.setPhotoOwner(a);
  }, { a: UID_A, b: UID_B });
  await page.reload(); await expect(page.locator('#photo-count')).toHaveText('1');
  await page.locator('#gallery-toggle').click();
  await expect(page.locator('.photo-card')).toContainText('account-a.png');
  await expect(page.locator('.photo-card')).not.toContainText('account-b.png');
  await expect(page.locator('.photo-card')).not.toContainText('legacy.png');
  await page.locator('#gallery-close').click();
  state.user = { id: UID_B, email: 'b@example.test' }; await page.reload();
  await expect(page.locator('#photo-count')).toHaveText('1'); await page.locator('#gallery-toggle').click();
  await expect(page.locator('.photo-card')).toContainText('account-b.png');
  await expect(page.locator('.photo-card')).not.toContainText('account-a.png');
  await page.locator('#gallery-close').click();
  await page.locator('#account-open').click(); await page.locator('#studio-logout').click();
  await expect(page).toHaveURL(/\/$/); await expect(page.locator('#account-open')).toHaveText('Masuk');
  const counts = await page.evaluate(async ({ a, b }) => {
    const store = await import('/photo-store.js');
    store.setPhotoOwner(a); const first = (await store.listPhotos()).length;
    store.setPhotoOwner(b); const second = (await store.listPhotos()).length;
    store.setPhotoOwner(null); const legacy = (await store.listPhotos()).length;
    return { first, second, legacy };
  }, { a: UID_A, b: UID_B });
  expect(counts).toEqual({ first: 0, second: 0, legacy: 1 });
  expect(requests.find(request => request.action === 'logout').csrf).toBe('csrf-fixture');
});

test('Auth outage does not block guest camera, capture, Print or canceling login', async ({ page }) => {
  await fakeVision(page);
  await page.route('**/api/studio?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable fixture' }) }));
  await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=free]').click(); await page.locator('#capture').click();
  await expect(page.locator('.photo-card')).toHaveCount(1); await page.locator('#gallery-toggle').click();
  await page.evaluate(() => { window.print = () => document.documentElement.dataset.printed = 'yes'; });
  await page.getByRole('button', { name: 'Print', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-printed', 'yes');
  const preview = await page.locator('.photo-card img').getAttribute('src');
  expect(await page.locator('#print-area img').getAttribute('src')).toBe(preview);
  expect(await page.locator('.photo-card img').evaluate(async img => {
    await img.decode();
    const photo = (await (await import('/photo-store.js')).listPhotos())[0];
    const original = await createImageBitmap(photo.blob);
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
    const raw = canvas.toDataURL(); original.close(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
    return raw !== canvas.toDataURL();
  })).toBe(true);
  await page.getByRole('link', { name: 'Unduh PNG' }).click(); await expect(page.locator('#studio-account')).toBeVisible();
  await page.locator('#studio-account-close').focus(); await page.keyboard.press('s'); await page.keyboard.press('2');
  await expect(page.locator('#photo-count')).toHaveText('1'); await expect(page.locator('body')).toHaveAttribute('data-mode', 'free');
  await page.keyboard.press('Escape'); await expect(page.locator('#studio-account')).toBeHidden(); await expect(page.locator('#saved-section')).toBeVisible();
  await expect(page.locator('.photo-card')).toHaveCount(1); await expect(page).toHaveURL(/\/$/);
});

test('failed guest preview never falls back to an original image or print', async ({ page }) => {
  await fakeVision(page); await mockAccount(page, { user: null });
  await page.addInitScript(() => {
    const original = window.createImageBitmap;
    window.createImageBitmap = (input, ...args) => input instanceof Blob ? Promise.reject(new Error('Synthetic preview failure')) : original(input, ...args);
  });
  await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=free]').click(); await page.locator('#capture').click();
  await expect(page.locator('#photo-count')).toHaveText('1'); await page.locator('#gallery-toggle').click();
  expect(await page.locator('.photo-card img').getAttribute('src')).toBeNull();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeDisabled();
  expect(await page.evaluate(async () => (await (await import('/photo-store.js')).listPhotos())[0].blob.size)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Unduh PNG' }).click(); await expect(page.locator('#studio-account')).toBeVisible();
});

test('completed photobooth waits for the account dialog before opening the result', async ({ page }) => {
  await fakeVision(page); await mockAccount(page, { user: null });
  await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.locator('#capture').click();
  await page.locator('#account-open').click();
  await expect(page.locator('#photo-count')).toHaveText('1', { timeout: 15000 });
  await expect(page.locator('#studio-account')).toBeVisible(); await expect(page.locator('#saved-section')).toBeHidden();
  await page.locator('#studio-account-close').click(); await expect(page.locator('#saved-section')).toBeVisible();
  await expect(page.locator('.photo-card img')).toBeVisible();
});

test('a delayed signed-in session response cannot restore an account after logout', async ({ page }) => {
  const state = { user: { id: UID_A, email: 'a@example.test' } }; await mockAccount(page, state);
  await page.goto('/'); await expect(page.locator('#account-open')).toHaveText('Akun');
  let release; const held = new Promise(resolve => { release = resolve; }); let intercepted = false;
  await page.route('**/api/studio?**', async route => {
    if (new URL(route.request().url()).searchParams.get('action') !== 'session') return route.fallback();
    intercepted = true; await held;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, user: { id: UID_A, email: 'a@example.test' }, csrfToken: 'csrf-fixture' }) });
  });
  await page.locator('#account-open').click(); await expect.poll(() => intercepted).toBe(true);
  await page.locator('#studio-logout').click(); await expect(page.locator('#account-open')).toHaveText('Masuk');
  release(); await page.waitForTimeout(200); await expect(page.locator('#account-open')).toHaveText('Masuk');
  expect(await page.evaluate(async () => (await import('/photo-store.js')).photoOwner())).toBe('guest');
});

test('login waits for a pending guest PNG and preserves it without retroactive upload', async ({ page }) => {
  await fakeVision(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob; let first = true;
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      if (first) { first = false; window.releaseGuestPng = () => original.call(this, callback, ...args); }
      else original.call(this, callback, ...args);
    };
  });
  const requests = await mockAccount(page, { user: null, consent: true });
  await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=free]').click(); await page.locator('#capture').click();
  await page.locator('#account-open').click(); await page.locator('#studio-email').fill('synthetic@example.test'); await page.locator('#studio-password').fill('synthetic password');
  await page.locator('#studio-login-form').getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.locator('#studio-login-form button[type=submit]')).toBeDisabled();
  await page.evaluate(() => window.releaseGuestPng());
  await expect(page.locator('#studio-account')).toBeHidden(); await expect(page.locator('.photo-card')).toHaveCount(1);
  expect(await page.evaluate(async () => (await (await import('/photo-store.js')).listPhotos()).map(photo => [photo.ownerId, photo.cloudConsentAtCapture]))).toEqual([[UID_A, false]]);
  expect(requests.some(item => item.action === 'upload')).toBe(false);
});

test('failed cleanup of an old cache owner cannot discard temporary guest photos during login', async ({ page }) => {
  await fakeVision(page);
  await page.addInitScript(owner => {
    localStorage.setItem('egz-cache-owner', owner);
    IDBFactory.prototype.open = () => { throw new DOMException('Blocked storage fixture', 'SecurityError'); };
  }, UID_B);
  await mockAccount(page, { user: null }); await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=free]').click();
  await page.locator('#capture').click(); await expect(page.locator('#photo-count')).toHaveText('1');
  await page.locator('#capture').click(); await expect(page.locator('#photo-count')).toHaveText('2');
  await page.locator('#gallery-toggle').click(); await page.getByRole('link', { name: 'Unduh PNG' }).first().click();
  await page.locator('#studio-email').fill('synthetic@example.test'); await page.locator('#studio-password').fill('synthetic password');
  const pending = page.waitForEvent('download'); await page.locator('#studio-login-form').getByRole('button', { name: 'Masuk', exact: true }).click(); await pending;
  await expect(page.locator('#studio-account')).toBeHidden(); await expect(page.locator('.photo-card')).toHaveCount(2); await expect(page.locator('#photo-count')).toHaveText('2');
  expect(await page.evaluate(async () => (await import('/photo-store.js')).photoOwner())).toBe(UID_A);
  await expect(page.locator('#feedback')).toContainText('sementara');
});

test('switching accounts cannot export a stale card owned by the previous account', async ({ page }) => {
  await fakeVision(page); const state = { user: { id: UID_A, email: 'a@example.test' } }; await mockAccount(page, state);
  await page.goto('/'); await expect(page.locator('#account-open')).toHaveText('Akun');
  await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=free]').click(); await page.locator('#capture').click();
  await expect(page.locator('.photo-card')).toHaveCount(1); await page.locator('#gallery-toggle').click();
  let downloads = 0; page.on('download', () => { downloads++; }); state.user = { id: UID_B, email: 'b@example.test' };
  await page.getByRole('link', { name: 'Unduh PNG' }).click();
  await expect(page.locator('#feedback')).toContainText('Akun berubah'); await expect(page.locator('.photo-card')).toHaveCount(0);
  expect(downloads).toBe(0);
});

test('logging in during a guest photobooth sequence retains all three frames locally', async ({ page }) => {
  await fakeVision(page); const requests = await mockAccount(page, { user: null, consent: true });
  await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.locator('#capture').click();
  await expect(page.locator('#shot-1')).toHaveClass('taken', { timeout: 5000 });
  await page.locator('#account-open').click(); await page.locator('#studio-email').fill('synthetic@example.test'); await page.locator('#studio-password').fill('synthetic password');
  await page.locator('#studio-login-form').getByRole('button', { name: 'Masuk', exact: true }).click(); await expect(page.locator('#studio-account')).toBeHidden();
  await expect(page.locator('.photo-card')).toHaveCount(1, { timeout: 20000 }); await expect(page.locator('.shot-list .taken')).toHaveCount(3);
  expect(requests.some(item => item.action === 'upload')).toBe(false);
  expect(await page.evaluate(async () => (await (await import('/photo-store.js')).listPhotos()).map(photo => [photo.ownerId, photo.kind, photo.cloudConsentAtCapture]))).toEqual([[UID_A, 'photobooth', false]]);
});

test('expired cloud session removes displayed photos and account cache', async ({ page }) => {
  const state = { user: { id: UID_A, email: 'a@example.test' }, expired: true,
    photos: [{ id: PHOTO, owner_id: UID_A, mode: 'free', name: 'synthetic.png', expires_at: new Date(Date.now() + 86400000).toISOString() }] };
  await mockAccount(page, state); await page.goto('/cloud-gallery.html');
  await expect(page.locator('.cloud-card')).toHaveCount(1);
  await page.evaluate(async owner => {
    const store = await import('/photo-store.js'); store.setPhotoOwner(owner);
    await store.storePhoto({ id: 'cached-before-expiry', ownerId: owner, createdAt: Date.now(), blob: new Blob(['fixture'], { type: 'image/png' }) });
  }, UID_A);
  await page.getByRole('button', { name: 'Hapus cloud', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, hapus cloud', exact: true }).click();
  await expect(page.locator('.cloud-card')).toHaveCount(0);
  await expect(page.locator('#gallery-status')).toContainText('Sesi berakhir');
  await expect.poll(() => page.evaluate(async owner => {
    const store = await import('/photo-store.js'); store.setPhotoOwner(owner); return (await store.listPhotos()).length;
  }, UID_A)).toBe(0);
});

test('no cloud upload without consent and consent does not retroactively send old captures', async ({ page }) => {
  await fakeVision(page);
  const state = { user: { id: UID_A, email: 'a@example.test' }, consent: false };
  const requests = await mockAccount(page, state);
  await page.goto('/'); await page.locator('#manual-access').click();
  await page.locator('#mode-nav [data-mode=free]').click(); await page.locator('#capture').click();
  await expect(page.locator('.photo-card')).toHaveCount(1);
  expect(requests.filter(request => request.action === 'upload')).toHaveLength(0);
  await page.locator('#account-open').click(); await page.locator('#studio-consent').check();
  await expect(page.locator('#studio-account-status')).toContainText('Persetujuan aktif');
  await page.getByRole('button', { name: 'Kembali', exact: true }).last().click();
  expect(requests.filter(request => request.action === 'upload')).toHaveLength(0);
  await page.locator('#capture').click();
  await expect.poll(() => requests.filter(request => request.action === 'upload').length).toBe(1);
  expect(requests.find(request => request.action === 'upload').csrf).toBe('csrf-fixture');
});

test('an adopted guest photo uploads only after consent and a specific manual save', async ({ page }) => {
  await fakeVision(page); const state = { user: null, consent: false }; const requests = await mockAccount(page, state);
  await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=free]').click(); await page.locator('#capture').click();
  await expect(page.locator('#photo-count')).toHaveText('1'); await page.locator('#gallery-toggle').click(); await page.getByRole('link', { name: 'Unduh PNG' }).click();
  await page.locator('#studio-email').fill('synthetic@example.test'); await page.locator('#studio-password').fill('synthetic password');
  const downloaded = page.waitForEvent('download'); await page.locator('#studio-login-form').getByRole('button', { name: 'Masuk', exact: true }).click(); await downloaded;
  await page.locator('#gallery-toggle').click(); await page.getByRole('button', { name: 'Simpan foto ini ke cloud' }).click();
  await expect(page.locator('#studio-account')).toBeVisible(); expect(requests.filter(request => request.action === 'upload')).toHaveLength(0);
  await page.locator('#studio-consent').check(); await expect(page.locator('#studio-account-status')).toContainText('Persetujuan aktif'); await page.locator('#studio-account-close').click();
  expect(requests.filter(request => request.action === 'upload')).toHaveLength(0);
  await page.getByRole('button', { name: 'Simpan foto ini ke cloud' }).click();
  await expect.poll(() => requests.filter(request => request.action === 'upload').length).toBe(1);
  await expect(page.locator('.cloud-photo-status')).toContainText('Tersimpan di cloud');
  await page.setViewportSize({ width: 568, height: 320 });
  for (const action of await page.locator('#saved-section .photo-actions button:visible, #saved-section .photo-actions a:visible').all()) await expect(action).toBeInViewport();
});

test('same account in independent contexts can read cloud results; admin page requires MFA', async ({ browser }) => {
  const photos = [{ id: PHOTO, owner_id: UID_A, mode: 'free', name: 'synthetic.png', bytes: 99, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() }];
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    for (const context of contexts) {
      const page = await context.newPage(); await mockAccount(page, { user: { id: UID_A, email: 'a@example.test' }, photos });
      await page.goto('/cloud-gallery.html'); await expect(page.locator('.cloud-card')).toHaveCount(1);
      await expect(page.locator('.cloud-card')).toContainText('synthetic.png');
      expect(await page.locator('.cloud-card img').evaluate(async img => { await img.decode(); return img.naturalWidth; })).toBe(1);
    }
    const page = await contexts[0].newPage();
    const requests = await mockAccount(page, { user: { id: UID_A, email: 'a@example.test' }, admin: true, mfaRequired: true, photos });
    await page.goto('/admin.html'); await expect(page.locator('#gallery-status')).toContainText('Verifikasi autentikator');
    expect(requests.some(request => request.action === 'admin-photos')).toBe(false);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('cloud gallery stays in the studio, pages one photo at a time, and confirms cloud deletion', async ({ page }) => {
  const state = { user: { id: UID_A, email: 'a@example.test' }, photos: [PHOTO, '44444444-4444-4444-8444-444444444444'].map(id => ({ id, mode: 'photobooth', name: `${id}.png`, expires_at: new Date(Date.now() + 86400000).toISOString() })) };
  await mockAccount(page, state); await page.goto('/'); await expect(page.locator('#account-open')).toHaveText('Akun');
  await page.locator('#account-open').click(); await page.locator('#studio-cloud-open').click();
  await expect(page.locator('#studio-cloud-gallery')).toBeVisible(); await expect(page.locator('#cloud-view-body img')).toBeVisible();
  await expect(page).toHaveURL(/\/$/); await expect(page.locator('#cloud-view-position')).toHaveText('1');
  await page.locator('#cloud-view-next').click(); await expect(page.locator('#cloud-view-position')).toHaveText('2');
  await expect(page.locator('#cloud-view-body img')).toHaveCount(1);
  const pending = page.waitForEvent('download'); await page.locator('#cloud-view-body').getByRole('button', { name: 'Unduh PNG' }).click(); expect((await pending).suggestedFilename()).toContain('44444444');
  await page.locator('#cloud-view-body').getByRole('button', { name: 'Hapus cloud', exact: true }).click();
  await expect(page.locator('#cloud-view-status')).toContainText('Foto lokal tetap ada');
  await page.locator('#cloud-view-body').getByRole('button', { name: 'Ya, hapus cloud' }).click();
  await expect(page.locator('#cloud-view-body img')).toHaveCount(0); await expect(page.locator('#cloud-view-status')).toContainText('Belum ada');
  await page.keyboard.press('Escape'); await expect(page.locator('#studio-cloud-gallery')).toBeHidden();
});

test('large PNG uses a smaller cloud copy while preserving the local original and aspect ratio', async ({ page }) => {
  const requests = await mockAccount(page, { user: { id: UID_A, email: 'a@example.test' }, consent: true });
  await page.goto('/'); await expect(page.locator('#account-open')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { prepareCloudImage, MAX_CLOUD_BYTES } = await import('/studio-cloud.js');
    const { api } = await import('/cloud-client.js');
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200;
    const context = canvas.getContext('2d'); const image = context.createImageData(canvas.width, canvas.height);
    let seed = 123456789;
    for (let i = 0; i < image.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; image.data[i + channel] = seed & 255; }
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const original = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const before = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer()))).join(',');
    const prepared = await prepareCloudImage(original); const bitmap = await createImageBitmap(prepared.blob);
    const width = bitmap.width, height = bitmap.height; bitmap.close();
    await api('upload', { method: 'POST', body: prepared.blob, headers: { 'Content-Type': 'image/png', 'X-Photo-Id': crypto.randomUUID(), 'X-Photo-Mode': 'photobooth' } });
    const after = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer()))).join(',');
    const small = new Blob(['small PNG fixture'], { type: 'image/png' }); const unchanged = await prepareCloudImage(small);
    return { originalBytes: original.size, cloudBytes: prepared.blob.size, limit: MAX_CLOUD_BYTES, resized: prepared.resized,
      width, height, originalUnchanged: before === after, smallPassThrough: unchanged.blob === small && unchanged.resized === false };
  });
  expect(result.originalBytes).toBeGreaterThan(result.limit);
  expect(result.cloudBytes).toBeLessThanOrEqual(result.limit);
  expect(result.cloudBytes).toBeLessThan(result.originalBytes);
  expect(result.width).toBeLessThan(1600); expect(result.height).toBeLessThan(1200);
  expect(Math.abs(result.width / result.height - 1600 / 1200)).toBeLessThan(0.003);
  expect(result.resized).toBe(true); expect(result.originalUnchanged).toBe(true); expect(result.smallPassThrough).toBe(true);
  expect(requests.find(request => request.action === 'upload').bytes).toBe(result.cloudBytes);
});

test('small account-mode viewports keep camera, navigation and account controls reachable', async ({ page }) => {
  await fakeVision(page); await mockAccount(page, { user: { id: UID_A, email: 'a@example.test' }, consent: false });
  for (const [width, height] of [[320, 568], [568, 320]]) {
    await page.setViewportSize({ width, height }); await page.goto('/');
    await expect(page.locator('#account-open')).toBeInViewport();
    await page.locator('#manual-access').click();
    await page.locator('#mode-nav [data-mode=free]').click();
    for (const id of ['account-open', 'toggle-tools', 'gallery-toggle', 'capture', 'stop-camera']) {
      const bounds = await page.locator(`#${id}`).boundingBox();
      expect(bounds, id).not.toBeNull();
      expect(bounds.x, id).toBeGreaterThanOrEqual(0); expect(bounds.y, id).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width, id).toBeLessThanOrEqual(width); expect(bounds.y + bounds.height, id).toBeLessThanOrEqual(height);
    }
    for (const button of await page.locator('#mode-nav button').all()) await expect(button).toBeInViewport();
    await page.locator('#account-open').click(); await expect(page.locator('#studio-consent')).toBeInViewport();
    await page.getByRole('button', { name: 'Kembali', exact: true }).last().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
