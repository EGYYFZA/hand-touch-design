import { test, expect } from '@playwright/test';

async function manual(page) {
  await page.goto('/'); await page.locator('#manual-access').click();
  await expect(page.locator('#menu-screen')).toBeVisible();
}

test('responsive layouts, readable contrast, labels, keyboard color and shape controls', async ({ page }) => {
  await manual(page);
  for (const width of [375,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    for (const mode of ['free','painting','photobooth','meme']) {
      await page.locator(`#mode-nav [data-mode=${mode}]`).click();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${width}/${mode}`).toBe(true);
    }
  }
  await page.locator('#mode-nav [data-mode=painting]').click(); await page.locator('#color-toggle').click();
  const color=await page.locator('#paint-color').inputValue();
  await page.locator('#color-field').focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#paint-color')).not.toHaveValue(color);
  await page.locator('#color-done').click(); await expect(page.locator('#color-toggle')).toBeFocused();
  await page.locator('[data-shape=triangle]').click(); await page.locator('#preview').focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('#feedback')).toHaveText('Bentuk ditempel.');
  await expect(page.locator('#undo-paint')).toBeEnabled();
  const issues=await page.evaluate(()=>{
    const bad=[];
    const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
    if(new Set(ids).size!==ids.length) bad.push('duplicate IDs');
    for(const input of document.querySelectorAll('input')) if(!input.labels?.length) bad.push(`label:${input.id}`);
    for(const button of document.querySelectorAll('button')) if(!button.textContent.trim() && !button.getAttribute('aria-label')) bad.push('button name');
    const luminance=hex=>{const c=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
    for(const [fg,bg] of [['#ecf4ff','#070d19'],['#9bafc8','#0b1424'],['#38bdf8','#0b1424'],['#031322','#38bdf8']]){
      const a=luminance(fg),b=luminance(bg);if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5)bad.push(`contrast:${fg}/${bg}`);
    }
    return bad;
  });
  expect(issues).toEqual([]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.locator('#capture').click();
  await expect(page.locator('#shot-feedback')).toBeVisible({timeout:5000});
  expect(await page.locator('#shutter').evaluate(e=>getComputedStyle(e).display)).toBe('none');
  await page.locator('#cancel-session').click();
});

test('real face model loads only on entering Meme and worker produces a result', async ({ page }) => {
  const failures=[], requests=[];
  page.on('pageerror',e=>failures.push(e.message)); page.on('request',r=>requests.push(r.url()));
  await manual(page); await page.locator('#mode-nav [data-mode=free]').click();
  await expect(page.locator('#tracking-state')).toContainText(/tangan|Gestur siap/,{timeout:45000});
  expect(requests.some(url=>url.endsWith('face_landmarker.task'))).toBe(false);
  const loaded=page.waitForResponse(r=>r.url().endsWith('face_landmarker.task') && r.status()===200);
  await page.locator('#mode-nav [data-mode=meme]').click(); await loaded;
  await expect(page.locator('#tracking-state')).toContainText('Wajah',{timeout:45000});
  await expect(page.locator('#feedback')).not.toContainText('gagal'); expect(failures).toEqual([]);
});

test('camera interruption pauses a session; resuming produces one strip without mode changes', async ({ page }) => {
  await manual(page); await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.locator('#capture').click();
  await page.locator('#stop-camera').click(); await expect(page.locator('#countdown')).toBeHidden();
  await page.waitForTimeout(1200); await expect(page.locator('.photo-card')).toHaveCount(0);
  await page.locator('#mode-nav [data-mode=painting]').click(); await expect(page.locator('body')).toHaveAttribute('data-mode','photobooth');
  await page.locator('#start-camera').click();
  await expect(page.locator('.photo-card')).toHaveCount(1,{timeout:15000});
  await expect(page.locator('#countdown')).toBeHidden();
});

test('failed PNG export retains the full three-shot strip and can retry after camera stops', async ({ page }) => {
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.toBlob;
    let failOnce=true;
    HTMLCanvasElement.prototype.toBlob=function(callback,...args){
      if(failOnce){failOnce=false;window.failedPicture=this.toDataURL();callback(null);}
      else original.call(this,callback,...args);
    };
  });
  await manual(page); await page.locator('#mode-nav [data-mode=photobooth]').click(); await page.locator('#capture').click();
  await expect(page.locator('#retry-save')).toBeVisible({timeout:15000});
  await expect(page.locator('.photo-card')).toHaveCount(0); await expect(page.locator('#capture')).toBeDisabled();
  await page.locator('#stop-camera').click(); await page.locator('#retry-save').click();
  await expect(page.locator('.photo-card')).toHaveCount(1); await expect(page.locator('#retry-save')).toBeHidden();
  const matches=await page.locator('.photo-card img').evaluate(async image=>{
    await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL()===window.failedPicture;
  });
  expect(matches).toBe(true);
});
