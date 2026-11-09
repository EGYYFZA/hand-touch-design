// Run after npm run build, with npm run dev serving localhost:4173.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile, stat, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const origin = new URL(url);
assert.ok(origin.origin === url && origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Use an exact local preview origin');
const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'] });
const report = { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), environment: 'Windows, headless Chromium with SwiftShader, localhost uncompressed HTTP, no throttling, synthetic camera pixels; real CPU MediaPipe inference', initialLoads: [], inference: {}, bundles: {} };
report.bundleBaseline = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.metrics = { lcp: 0, cls: 0 };
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.metrics.lcp = e.startTime; }).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.metrics.cls += e.value; }).observe({type:'layout-shift',buffered:true});
      window.homeFrames = [];
      const clear = WebGL2RenderingContext.prototype.clear;
      WebGL2RenderingContext.prototype.clear = function(...args) {
        if (this.canvas.classList.contains('home-scene')) window.homeFrames.push(performance.now());
        return clear.apply(this, args);
      };
    });
    await page.goto(url); await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.body.dataset.homeMotion === 'paused' && window.homeFrames.length > 0, null, { timeout: 20000 });
    const frames = await page.evaluate(() => window.homeFrames);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.homeFrames.length), frames.length, 'Settled scene must stop rendering');
    const metrics = await page.evaluate(() => {
      const nav=performance.getEntriesByType('navigation')[0], resources=performance.getEntriesByType('resource');
      return { fcpMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime, lcpMs:window.metrics.lcp, cls:window.metrics.cls,
        ttfbMs:nav.responseStart-nav.requestStart, transferredBytes:nav.transferSize+resources.reduce((sum,r)=>sum+r.transferSize,0), requests:resources.length+1 };
    });
    metrics.homeFrames = frames.length;
    metrics.homeActiveFps = (frames.length - 1) * 1000 / (frames.at(-1) - frames[0]);
    assert.ok(metrics.fcpMs > 0 && metrics.lcpMs > 0 && Number.isFinite(metrics.homeActiveFps));
    assert.ok(metrics.transferredBytes < 3_500_000, 'Loopback transfer includes uncompressed Three modules');
    report.initialLoads.push(metrics);
    await context.close();
  }
  const context = await browser.newContext({ viewport:{width:1440,height:900}, permissions:['camera'] });
  const page=await context.newPage(); const failures=[]; page.on('pageerror',e=>failures.push(e.message));
  await page.addInitScript(()=>{
    window.visionSamples=[]; window.visionReadyAt=null;
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args) { super(...args); this.addEventListener('message',({data})=>{
        if(data.type==='ready') window.visionReadyAt=performance.now();
        if(data.type==='result') window.visionSamples.push({mode:data.mode,ms:performance.now()-data.timestamp});
      }); }
    };
  });
  await page.addInitScript(() => localStorage.setItem('egz-tutorial-auto-v1', 'off'));
  await page.goto(url); await page.keyboard.press('m');
  await page.waitForFunction(() => document.getElementById('empty-state').hidden);
  assert.equal(await page.locator('.home-scene').count(), 0, 'Active camera must release the decorative renderer after video is ready');
  await page.locator('#mode-nav [data-mode=free]').click();
  await page.waitForFunction(()=>window.visionSamples.filter(s=>s.mode==='free').length>=40,null,{timeout:45000});
  await page.locator('#mode-nav [data-mode=meme]').click();
  await page.waitForFunction(()=>window.visionSamples.filter(s=>s.mode==='meme').length>=40,null,{timeout:45000});
  const samples=await page.evaluate(()=>window.visionSamples);
  for (const mode of ['free','meme']) {
    const times=samples.filter(s=>s.mode===mode).map(s=>s.ms);
    report.inference[mode]={samples:times.length,firstMs:times[0],p50Ms:percentile(times.slice(1),.5),p95Ms:percentile(times.slice(1),.95)};
  }
  assert.equal(failures.length,0); report.pageErrors=failures;
  report.inp='Not measured: field INP requires representative interactions; no field performance claim.';
  report.dwellMs=800;
  await context.close();
  for (const file of ['web/app.js','web/gestures.js','web/styles.css','web/home-motion.js','web/home-scene.js']) {
    const after=await readFile(file); let before=null;
    try { before=execFileSync('git',['show',`HEAD:${file}`],{stdio:['ignore','pipe','ignore']}); } catch { /* New source has no baseline blob. */ }
    report.bundles[file]={beforeBytes:before?.length ?? null,afterBytes:after.length,beforeGzipBytes:before ? gzipSync(before).length : null,afterGzipBytes:gzipSync(after).length};
  }
  let runtimeGzipBytes=0;
  for (const file of ['vendor/three.module.js','vendor/three.core.js','home-scene.js','home-motion.js','mascot.js']) runtimeGzipBytes+=gzipSync(await readFile(`dist/${file}`)).length;
  report.home3D={runtimeGzipBytes,posterBytes:(await stat('web/home-mascot.webp')).size,settledRenderer:'stopped',cameraRenderer:'disposed'};
  assert.ok(runtimeGzipBytes<=500*1024 && report.home3D.posterBytes<=120*1024,'Landing asset budget');
  let assets=0; for(const name of await readdir('web/memes')) assets+=(await stat(`web/memes/${name}`)).size;
  report.memeAssetsBytes=assets;
  report.modelBytes={hand:(await stat('models/hand_landmarker.task')).size,face:(await stat('models/face_landmarker.task')).size};
  report.limits=['Synthetic camera has no human hands/faces. These timings are not recognition accuracy or worst-case face inference.', 'New browser contexts; OS disk cache is warm. Network and CPU are not throttled.', 'Initial-page transfer excludes on-demand MediaPipe models/WASM.', 'SwiftShader is software rendering: scene FPS is not a real-device GPU benchmark. Gzip sizes are calculated, not observed production transfer.'];
  await mkdir('.ecc/benchmarks',{recursive:true});
  await writeFile(`.ecc/benchmarks/egz-${report.date}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
