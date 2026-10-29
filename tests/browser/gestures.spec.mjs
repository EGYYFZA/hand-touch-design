import { test, expect } from '@playwright/test';
import { hand, fakeVision, pose, pointAt } from './fixtures.mjs';

async function setup(page) {
  await fakeVision(page); await page.goto('/');
  await page.locator('#start-camera').click();
  await expect(page.locator('#calibration')).toBeVisible();
}
async function calibrate(page) {
  await setup(page);
  await pose(page, [hand('open', .3, .5), hand('open', .75, .5)]);
  await expect(page.locator('#enter-studio')).toBeVisible();
  await pointAt(page, '#enter-studio');
  await expect(page.locator('#menu-screen')).toBeVisible();
}
async function mode(page, name) {
  await pointAt(page, `#mode-nav [data-mode=${name}]`);
  await expect(page.locator('body')).toHaveAttribute('data-mode', name);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'studio');
  await pose(page, []);
}
async function paintPixels(page) {
  return page.locator('#preview').evaluate(canvas => {
    const color = document.getElementById('paint-color').value.match(/\w\w/g).map(v => parseInt(v,16));
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let n = 0;
    for(let i=0;i<pixels.length;i+=4) if(color.every((v,j)=>Math.abs(pixels[i+j]-v)<3)) n++;
    return n;
  });
}

test('calibration requires continuous two-hand visibility; full menu is controlled by a finger', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#mode-nav')).toHaveAttribute('inert', '');
  await page.evaluate(() => window.fixtureAge = 1000);
  await pose(page, [hand('open',.3,.5),hand('open',.75,.5)]); await page.waitForTimeout(1200);
  await expect(page.locator('#calibration-progress')).toHaveJSProperty('value', 0);
  await page.evaluate(() => window.fixtureAge = 0);
  await pose(page, [hand('open',.3,.5),hand('open',.75,.5)]); await page.waitForTimeout(450);
  await pose(page, []); await page.waitForTimeout(200);
  await pose(page, [hand('open',.3,.5),hand('open',.75,.5)]); await page.waitForTimeout(450);
  await expect(page.locator('#enter-studio')).toBeHidden();
  await expect(page.locator('#enter-studio')).toBeVisible();
  await pointAt(page,'#enter-studio'); await expect(page.locator('#menu-screen')).toBeVisible();
  for(const name of ['painting','photobooth','meme','free']) await mode(page,name);
  await expect(page.locator('#gesture-cursor')).toBeHidden();
});

test('finger opens full color picker, changes hue and saturation, and selects a shape', async ({ page }) => {
  await calibrate(page); await mode(page,'painting');
  await pointAt(page,'#color-toggle'); await expect(page.locator('#color-picker')).toBeVisible();
  const before = await page.locator('#paint-color').inputValue();
  await pointAt(page,'#color-hue'); await expect(page.locator('#color-hue')).toHaveValue(/17[5-9]|18[0-4]/);
  await pointAt(page,'#color-field'); await expect(page.locator('#paint-color')).not.toHaveValue(before);
  await pointAt(page,'#color-done'); await expect(page.locator('#color-picker')).toBeHidden();
  await pointAt(page,'[data-shape=circle]'); await expect(page.locator('[data-shape=circle]')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'docs/ui-preview/egz-painting-desktop.png',fullPage:true});
});

test('two pinches resize shapes; release commits, tracking loss cancels, clear removes', async ({ page }) => {
  await calibrate(page); await mode(page,'painting');
  for (const tool of ['circle','square','triangle']) {
    await pointAt(page,`[data-shape=${tool}]`); await expect(page.locator(`[data-shape=${tool}]`)).toHaveAttribute('aria-pressed','true');
    await pose(page,[hand('pinch',.5,.3),hand('pinch',.8,.6)]);
    await expect.poll(()=>paintPixels(page)).toBeGreaterThan(300);
    await pose(page,[]); await expect.poll(()=>paintPixels(page)).toBeLessThan(20);
    await pose(page,[hand('pinch',.5,.3),hand('pinch',.9,.75)]);
    await expect.poll(()=>paintPixels(page)).toBeGreaterThan(300);
    await pose(page,[hand('open',.5,.3),hand('open',.9,.75)]);
    await page.waitForTimeout(150); await pose(page,[]);
    await expect.poll(()=>paintPixels(page)).toBeGreaterThan(300);
    await pointAt(page,'#clear-paint');
    await expect.poll(()=>paintPixels(page)).toBeLessThan(20); await pose(page,[]);
  }
  await pointAt(page,'[data-shape=brush]'); await expect(page.locator('[data-shape=brush]')).toHaveAttribute('aria-pressed','true');
  await pose(page,[hand('fist')]); await page.waitForTimeout(200); expect(await paintPixels(page)).toBeLessThan(20);
  await pose(page,[hand('pinch')]); await expect.poll(()=>paintPixels(page)).toBeGreaterThan(20);
});

test('fist starts exactly three flashed shots and exports a festive white frame, without retriggering', async ({ page }) => {
  await calibrate(page); await mode(page,'photobooth');
  await page.evaluate(()=>{
    window.shotMessages=[];
    new MutationObserver(()=>{const s=document.getElementById('shot-feedback').textContent; if(s && !window.shotMessages.includes(s)) window.shotMessages.push(s);})
      .observe(document.getElementById('shot-feedback'),{childList:true});
  });
  await pose(page,[hand('fist')]);
  await expect(page.locator('#countdown')).toBeVisible();
  await expect(page.locator('.photo-card')).toHaveCount(1,{timeout:20000});
  expect(await page.evaluate(()=>window.shotMessages)).toEqual(['FOTO 1 / 3 TERTANGKAP','FOTO 2 / 3 TERTANGKAP','FOTO 3 / 3 TERTANGKAP']);
  await expect(page.locator('.shot-list .taken')).toHaveCount(3);
  const photo = page.locator('.photo-card img');
  const result = await photo.evaluate(async image=>{
    await image.decode(); const c=document.createElement('canvas'); c.width=image.naturalWidth; c.height=image.naturalHeight;
    const ctx=c.getContext('2d'); ctx.drawImage(image,0,0);
    return {w:c.width,h:c.height,corner:[...ctx.getImageData(0,0,1,1).data],data:c.toDataURL()};
  });
  expect(result.h).toBeGreaterThan(result.w*1.5); expect(result.corner).toEqual([255,255,255,255]);
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('docs/ui-preview', { recursive: true });
  await writeFile('docs/ui-preview/egz-photostrip.png',Buffer.from(result.data.split(',')[1],'base64'));
  await page.waitForTimeout(1000); await expect(page.locator('#countdown')).toBeHidden();
  await pose(page,[]); await page.waitForTimeout(400); await pose(page,[hand('fist')]);
  await page.waitForTimeout(700); await expect(page.locator('#countdown')).toBeHidden();
});

test('meme shows original monkey image only after matching face and hand, then clears on loss', async ({ page }) => {
  await calibrate(page); await mode(page,'meme');
  const face=Array.from({length:478},()=>({x:.5,y:.3}));
  face[13]={x:.5,y:.35}; face[14]={x:.5,y:.37}; face[234]={x:.4,y:.3}; face[454]={x:.6,y:.3}; face[152]={x:.5,y:.42}; face[61]={x:.45,y:.36};face[291]={x:.55,y:.36};
  const smile=[{categoryName:'mouthSmileLeft',score:.8}];
  await pose(page,[hand('point')],face,[]); await page.waitForTimeout(400); await expect(page.locator('#meme-image')).toBeHidden();
  await pose(page,[hand('point')],face,smile); await expect(page.locator('#meme-image')).toHaveAttribute('src',/idea.webp/);
  await expect(page.locator('#meme-image')).toBeVisible();
  expect(await page.locator('#meme-image').evaluate(image=>image.naturalWidth)).toBe(640);
  const clingy=hand('point'); clingy[8]={x:.5,y:.36};
  await pose(page,[clingy],face,smile); await expect(page.locator('#meme-image')).toHaveAttribute('src',/clingy.webp/);
  await pose(page,[hand('open',.46,.55),hand('open',.54,.55)],face,[{categoryName:'jawOpen',score:.8},{categoryName:'eyeWideLeft',score:.7}]);
  await expect(page.locator('#meme-image')).toHaveAttribute('src',/shock.webp/);
  await page.screenshot({path:'docs/ui-preview/egz-meme-desktop.png',fullPage:true});
  await pose(page,[]); await expect(page.locator('#meme-image')).toBeHidden();
});

test('gesture uses an in-page confirmation to delete and can cancel it', async ({ page }) => {
  await calibrate(page); await mode(page,'free');
  await pointAt(page,'#capture'); await expect(page.locator('.photo-card')).toHaveCount(1);
  await pointAt(page,'#gallery-toggle'); await expect(page.locator('#saved-section')).toBeVisible();
  await pointAt(page,'.photo-card button:text-is("Hapus")'); await expect(page.getByRole('button',{name:'Ya, hapus'})).toBeVisible();
  await pointAt(page,'.photo-card button:text-is("Batal hapus")'); await expect(page.getByRole('button',{name:'Ya, hapus'})).toBeHidden();
  await pointAt(page,'.photo-card button:text-is("Hapus")'); await expect(page.getByRole('button',{name:'Ya, hapus'})).toBeVisible();
  await pointAt(page,'.photo-card button:text-is("Ya, hapus")'); await expect(page.locator('.photo-card')).toHaveCount(0);
});

test('pinch paints with either hand; open fingers and a relaxed fist erase without a joining stroke', async ({ page }) => {
  await setup(page); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=painting]').click();
  // The manual pointer eraser must not change the pinch gesture's meaning.
  await page.locator('#eraser').click();
  const pinch = hand('pinch', .5, .5), other = hand('peace', .8, .45);
  await pose(page, [other, pinch]); await expect.poll(() => paintPixels(page)).toBeGreaterThan(20);
  await pose(page, [pinch, other]); await page.waitForTimeout(180);
  const before = await paintPixels(page); expect(before).toBeLessThan(180);
  await pose(page, [hand('open', .2525, .47)]); await expect.poll(() => paintPixels(page)).toBeLessThan(10);
  await pose(page, [pinch]); await expect.poll(() => paintPixels(page)).toBeGreaterThan(20);
  await pose(page, [hand('fist', .2525, .47)]); await expect.poll(() => paintPixels(page)).toBeLessThan(10);
  await pose(page, []);
  const closed = hand('fist'); closed[4] = { x: .445, y: .58 }; closed[8] = { ...closed[4] };
  await pose(page, [closed]); await expect.poll(() => paintPixels(page)).toBeGreaterThan(20);
});

test('mosaic clips to the fingertip polygon and leaves the bounding-box corners unchanged', async ({ page }) => {
  await fakeVision(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const source = document.createElement('canvas'); source.width = 1280; source.height = 720;
      const context = source.getContext('2d');
      for (let y = 0; y < 720; y += 6) for (let x = 0; x < 1280; x += 6) { context.fillStyle = ((x + y) / 6) % 2 ? '#ffffff' : '#000000'; context.fillRect(x, y, 6, 6); }
      const stream = source.captureStream(30); setInterval(() => context.fillRect(0, 0, 1, 1), 30); return stream;
    };
  });
  await page.goto('/'); await page.locator('#manual-access').click(); await page.locator('#mode-nav [data-mode=free]').click();
  await page.locator('#video').evaluate(video => video.readyState >= 2 || new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true })));
  await page.waitForTimeout(150);
  await page.locator('#preview').evaluate(canvas => { window.beforePolygon = new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data); });
  const a = hand('l_up', .37, .5), b = hand('l_down', .8, .4);
  const angle = .3;
  const rotated = [a, b].map(points => points.map(p => ({ ...p, x: .5 + (p.x - .5) * Math.cos(angle) - (p.y - .5) * Math.sin(angle), y: .5 + (p.x - .5) * Math.sin(angle) + (p.y - .5) * Math.cos(angle) })));
  await pose(page, rotated); await expect(page.locator('#effect-state')).toHaveText('MOSAIK');
  const result = await page.locator('#preview').evaluate(async (canvas, points) => {
    const { automaticEffect, describeHand } = await import('/gestures.js');
    const effect = automaticEffect(points.map(p => describeHand(p, canvas.width / canvas.height)));
    const path = new Path2D(); effect.polygon.forEach((p, i) => path[i ? 'lineTo' : 'moveTo'](p.x * canvas.width, p.y * canvas.height)); path.closePath();
    const context = canvas.getContext('2d'), after = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let outside = 0, outsideChanged = 0, insideChanged = 0;
    const r = effect.rect;
    for (let y = Math.ceil(r.y * canvas.height) + 10; y < (r.y + r.h) * canvas.height - 10; y += 5) {
      for (let x = Math.ceil(r.x * canvas.width) + 10; x < (r.x + r.w) * canvas.width - 10; x += 5) {
        const nearEdge = context.isPointInPath(path, x, y) !== context.isPointInPath(path, x + 8, y + 8) || context.isPointInPath(path, x, y) !== context.isPointInPath(path, x - 8, y - 8);
        if (nearEdge) continue;
        const i = (y * canvas.width + x) * 4, changed = Math.abs(after[i] - window.beforePolygon[i]) > 10;
        if (context.isPointInPath(path, x, y)) { if (changed) insideChanged++; }
        else { outside++; if (changed) outsideChanged++; }
      }
    }
    return { outside, outsideChanged, insideChanged };
  }, rotated);
  expect(result.outside).toBeGreaterThan(100); expect(result.outsideChanged).toBe(0); expect(result.insideChanged).toBeGreaterThan(100);
});

test('festive photobooth decorations preserve every pixel of all three original shots', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const { createPhotoStrip } = await import('/photo-strip.js');
    const shots = [0, 1, 2].map(shot => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const c = canvas.getContext('2d'), data = c.createImageData(320, 180);
      for (let i = 0; i < data.data.length; i += 4) { data.data[i] = (i / 4 + shot * 71) % 256; data.data[i + 1] = (i / 16 + shot * 37) % 256; data.data[i + 2] = 130 + shot * 40; data.data[i + 3] = 255; }
      c.putImageData(data, 0, 0); return canvas;
    });
    const strip = createPhotoStrip(shots), c = strip.getContext('2d');
    const differences = shots.map((shot, i) => {
      const original = shot.getContext('2d').getImageData(0, 0, 320, 180).data;
      const framed = c.getImageData(18, 42 + i * 188, 320, 180).data;
      return original.reduce((n, value, index) => n + (value !== framed[index] ? 1 : 0), 0);
    });
    return { differences, width: strip.width, height: strip.height, corner: [...c.getImageData(0, 0, 1, 1).data], fontLoaded: document.fonts.check('16px "Mona Sans"') };
  });
  expect(result.differences).toEqual([0, 0, 0]); expect(result.width).toBe(356); expect(result.height).toBe(636);
  expect(result.corner).toEqual([255, 255, 255, 255]); expect(result.fontLoaded).toBe(true);
});
