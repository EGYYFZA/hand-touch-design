import { test, expect } from '@playwright/test';
import { fakeVision } from './fixtures.mjs';

test('small portrait and desktop strips keep decorations inside the canvas and every photo uncropped', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const frame = await import('/photo-strip.js'); await frame.preparePhotoStrip();
    return [[180,320,16,54,11,212,1086],[1280,720,115,384,77,1510,3056]].map(([w,h,x,y,gap,width,height]) => {
      const shots = [0,1,2].map(i => {
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const c = canvas.getContext('2d'); c.fillStyle = ['#ff0000','#00ff00','#0000ff'][i]; c.fillRect(0,0,w,h); return canvas;
      });
      const strip = frame.createPhotoStrip(shots), c = strip.getContext('2d');
      const photosIntact = shots.every((_, shot) => c.getImageData(x,y+shot*(h+gap),w,h).data.every((value,index) => value === (index % 4 === shot || index % 4 === 3 ? 255 : 0)));
      const edges = [c.getImageData(0,0,strip.width,1),c.getImageData(0,strip.height-1,strip.width,1),c.getImageData(0,0,1,strip.height),c.getImageData(strip.width-1,0,1,strip.height)];
      return { correctSize: strip.width === width && strip.height === height, photosIntact, clearEdges: edges.every(edge => edge.data.every(value => value === 255)) };
    });
  });
  expect(results).toEqual([{correctSize:true,photosIntact:true,clearEdges:true},{correctSize:true,photosIntact:true,clearEdges:true}]);
});

test('missing decorations preserve all three photos; frame art retries after the network recovers', async ({ page }) => {
  await page.goto('/');
  await page.route('**/home-*.webp', route => route.abort());
  const fallback = await page.evaluate(async () => {
    const frame = await import('/photo-strip.js');
    const loaded = await frame.preparePhotoStrip();
    window.testShots = [0, 1, 2].map(i => {
      const shot = document.createElement('canvas'); shot.width = 320; shot.height = 180;
      const c = shot.getContext('2d'); c.fillStyle = ['#fa2745', '#2cba83', '#3259db'][i]; c.fillRect(0, 0, 320, 180); return shot;
    });
    const strip = frame.createPhotoStrip(window.testShots), c = strip.getContext('2d');
    window.simpleFrame = strip.toDataURL();
    return { loaded, centers: [0, 1, 2].map(i => [...c.getImageData(189, 186 + i * 199, 1, 1).data]) };
  });
  expect(fallback).toEqual({ loaded: false, centers: [[250,39,69,255], [44,186,131,255], [50,89,219,255]] });
  await page.unroute('**/home-*.webp');
  const recovered = await page.evaluate(async () => {
    const frame = await import('/photo-strip.js'), loaded = await frame.preparePhotoStrip();
    const strip = frame.createPhotoStrip(window.testShots), c = strip.getContext('2d');
    return { loaded, changed: strip.toDataURL() !== window.simpleFrame, centers: [0,1,2].map(i => [...c.getImageData(189, 186 + i * 199, 1, 1).data]) };
  });
  expect(recovered.loaded).toBe(true); expect(recovered.changed).toBe(true); expect(recovered.centers).toEqual(fallback.centers);
});

test('canceling frame preparation cannot start a delayed photo sequence', async ({ page }) => {
  await fakeVision(page); await page.goto('/'); await page.keyboard.press('m');
  await page.locator('#mode-nav [data-mode=photobooth]').click();
  let release; const held = new Promise(resolve => { release = resolve; });
  await page.route('**/home-*.webp', async route => { await held; await route.continue(); });
  try {
    await page.keyboard.press('s'); await expect(page.locator('#feedback')).toContainText('Menyiapkan frame');
    await page.keyboard.press('Escape'); await expect(page.locator('#feedback')).toContainText('Sesi dibatalkan');
    release(); await page.evaluate(async () => (await import('/photo-strip.js')).preparePhotoStrip());
    await expect(page.locator('#countdown')).toBeHidden(); await expect(page.locator('.photo-card')).toHaveCount(0);
    await page.keyboard.press('s'); await expect(page.locator('#countdown')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('#countdown')).toBeHidden();
  } finally { release(); }
});
