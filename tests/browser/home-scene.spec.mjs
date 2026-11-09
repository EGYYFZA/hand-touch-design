import { test, expect } from '@playwright/test';
import { fakeVision } from './fixtures.mjs';

test.beforeEach(async ({ page }) => { await fakeVision(page); });
const ready = page => expect(page.locator('body')).toHaveAttribute('data-home-scene', 'ready', { timeout: 15000 });
const settled = page => expect(page.locator('body')).toHaveAttribute('data-home-motion', 'paused', { timeout: 15000 });

test('mascot and all four surroundings respond to the pointer, then stop drawing', async ({ page }) => {
  const external = [], errors = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4174') && !request.url().startsWith('blob:')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.homeDraws = 0;
    const original = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      if (this.canvas.classList.contains('home-scene')) window.homeDraws++;
      return original.apply(this, args);
    };
  });
  await page.goto('/'); await ready(page); await settled(page);
  const count = await page.evaluate(() => window.homeDraws); expect(count).toBeGreaterThan(0);
  await page.waitForTimeout(250); expect(await page.evaluate(() => window.homeDraws)).toBe(count);
  const {width,height} = page.viewportSize();
  const clips = [[.05,.15],[.7,.15],[.05,.6],[.7,.6]].map(([x,y])=>({x:x*width,y:y*height,width:width*.25,height:height*.35}));
  const before = [];
  for (const clip of clips) before.push(await page.screenshot({clip}));
  await page.mouse.move(1100, 450); await expect.poll(() => page.evaluate(() => window.homeDraws)).toBeGreaterThan(count);
  await settled(page);
  for (const [index,clip] of clips.entries()) expect((await page.screenshot({clip})).equals(before[index]), `Decoration ${index+1} must visibly respond to the pointer`).toBe(false);
  const after = await page.evaluate(() => window.homeDraws);
  await page.waitForTimeout(250); expect(await page.evaluate(() => window.homeDraws)).toBe(after);
  await expect(page.locator('.home-scene')).toHaveCount(1);
  await expect(page.locator('.home-scene')).toHaveAttribute('aria-hidden', 'true');
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('reduced motion uses the rendered poster without loading Three; preference changes release the canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scenes = []; page.on('request', request => { if (/home-scene\.js|three\.(module|core)\.js/.test(request.url())) scenes.push(request.url()); });
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'fallback');
  expect(scenes).toEqual([]);
  await expect(page.locator('#home-art img')).toHaveJSProperty('naturalWidth', 560);
  await expect(page.locator('#start-camera')).toBeEnabled();
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.home-scene')).toHaveCount(0); await settled(page);
});

test('WebGL unavailable and failed module loading retain a usable poster and camera entry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'fallback');
  await expect(page.locator('#home-art img')).toBeVisible();
  await page.keyboard.press('m'); await expect(page.locator('#menu-screen')).toBeVisible();
  await page.route('**/home-scene.js', route => route.abort());
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'fallback');
  await expect(page.locator('#start-camera')).toBeEnabled();
  await expect(page.locator('.home-scene')).toHaveCount(0);
});

test('camera permission and denial keep the same 3D scene without switching to flat artwork', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      window.canvasAtPermission = document.querySelector('.home-scene');
      return new Promise((resolve, reject) => { window.denyCamera = () => reject(new DOMException('Synthetic denial', 'NotAllowedError')); });
    };
  });
  await page.goto('/'); await ready(page); await page.locator('#start-camera').click();
  await expect.poll(() => page.evaluate(() => !!window.canvasAtPermission)).toBe(true);
  await expect(page.locator('.home-scene')).toHaveCount(1); await ready(page);
  await expect(page.locator('#home-splash')).toBeHidden();
  await expect(page.locator('.studio-celebration')).toBeHidden();
  await expect(page.locator('#start-camera')).toBeDisabled();
  await page.evaluate(() => window.denyCamera());
  await expect(page.locator('#camera-message')).toContainText('Izin kamera ditolak');
  await expect(page.locator('#start-camera')).toBeEnabled(); await ready(page);
  expect(await page.evaluate(() => document.querySelector('.home-scene') === window.canvasAtPermission)).toBe(true);
});

test('3D stays visible until camera video is ready, then releases before gesture processing', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => new Promise((resolve, reject) => {
      window.allowCamera = () => original(constraints).then(resolve, reject);
    });
  });
  await page.goto('/'); await ready(page); await page.locator('#start-camera').click();
  await expect(page.locator('body')).toHaveAttribute('data-home-camera', 'pending');
  await ready(page); await expect(page.locator('.home-scene')).toHaveCount(1);
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.evaluate(() => window.allowCamera());
  await expect(page.locator('#video')).toHaveJSProperty('readyState', 4);
  await expect(page.locator('#empty-state')).toBeHidden();
  await expect(page.locator('.home-scene')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-home-camera', 'idle');
});

test('cold loading uses the 3D splash and render assets; skip reveals a usable 3D poster', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/home-scene.js', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/'); await expect(page.locator('#home-splash')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'loading');
    await expect(page.locator('svg.studio-celebration')).toHaveCount(0);
    await expect(page.locator('.studio-celebration img')).toHaveCount(4);
    for (const image of await page.locator('.studio-celebration img').all()) expect(await image.evaluate(async img => { await img.decode(); return img.naturalWidth; })).toBe(320);
    await page.locator('#splash-skip').click(); await expect(page.locator('#home-splash')).toBeHidden();
    await expect(page.locator('#home-art img')).toBeVisible(); await expect(page.locator('#start-camera')).toBeEnabled();
    release(); await ready(page);
  } finally { release(); }
});

test('a stalled 3D import cannot trap users in the splash', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/home-scene.js', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/'); await expect(page.locator('#home-splash')).toBeVisible();
    await expect(page.locator('#home-splash')).toBeHidden({ timeout: 5500 });
    await expect(page.locator('#start-camera')).toBeEnabled();
    release(); await ready(page);
  } finally { release(); }
});

test('late scene import never creates a renderer after entering the camera', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/home-scene.js', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'loading');
    await page.keyboard.press('m'); await expect(page.locator('#menu-screen')).toBeVisible();
    release(); await page.waitForTimeout(300);
    await expect(page.locator('.home-scene')).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'fallback');
  } finally { release(); }
});

test('repeated camera transitions, visibility and real WebGL context loss clean up decoration', async ({ page }) => {
  await page.goto('/'); await ready(page);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('m'); await expect(page.locator('#empty-state')).toBeHidden();
    await expect(page.locator('.home-scene')).toHaveCount(0);
    await page.keyboard.press('x'); await ready(page); await expect(page.locator('.home-scene')).toHaveCount(1);
  }
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.home-scene')).toHaveCount(0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await ready(page);
  await page.locator('.home-scene').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(page.locator('body')).toHaveAttribute('data-home-scene', 'fallback');
  await expect(page.locator('.home-scene')).toHaveCount(0);
  await expect(page.locator('#start-camera')).toBeEnabled();
});

test('landing and camera-error copy fit narrow, short and wide viewports with reachable HTML controls', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Synthetic denial', 'NotAllowedError'); }; });
  await page.goto('/');
  for (const [width, height] of [[320,568],[390,844],[568,320],[844,390],[768,900],[1440,900]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-message')).toContainText('Izin kamera ditolak');
    await expect(page.locator('#start-camera')).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Privacy Policy', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await ready(page); await expect(page.locator('.home-scene')).toHaveCount(1);
    await page.locator('#start-camera').focus(); await expect(page.locator('#start-camera')).toBeFocused();
    const controls = await page.locator('#start-camera').boundingBox(), header = await page.locator('.topbar').boundingBox();
    expect(controls.y).toBeGreaterThanOrEqual(header.y + header.height);
  }
});
