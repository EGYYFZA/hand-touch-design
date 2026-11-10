import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const assets = {};
for (const name of ['mascot','mint','star','ticket','ribbon']) assets[name] = `data:image/webp;base64,${(await readFile(resolve(root, `web/home-${name}.webp`))).toString('base64')}`;
const font = `data:font/woff2;base64,${(await readFile(resolve(root, 'web/fonts/mona-sans.woff2'))).toString('base64')}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><style>
    @font-face{font-family:Mona;src:url('${font}');font-weight:200 900}
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#102a1b;font-family:Mona,Arial,sans-serif}
    main{position:relative;width:1280px;height:640px;overflow:hidden;border:1px solid #d8e6db;border-radius:32px;background:#fcfdf9}
    .grid{position:absolute;inset:0;background-image:radial-gradient(#0d673119 1px,transparent 1px);background-size:24px 24px;mask-image:linear-gradient(90deg,transparent 43%,#000)}
    .copy{position:absolute;left:64px;top:51px;z-index:2}.brand{font-size:38px;font-weight:850;letter-spacing:-2px}.brand span{font-weight:450;letter-spacing:-1.7px}
    .eyebrow{margin:44px 0 15px;color:#0d6731;font-size:13px;letter-spacing:2.4px;font-weight:750}
    h1{font-size:76px;line-height:1.03;letter-spacing:-4px;margin:0;font-weight:760}
    .features{font-size:19px;color:#526057;margin:22px 0 30px;letter-spacing:-.3px}
    .open{display:inline-block;padding:13px 20px;border-radius:99px;background:#d1f441;color:#102a1b;font-size:16px;font-weight:750;border:1px solid #102a1b}
    .address{display:block;margin-top:25px;font-size:13px;letter-spacing:.3px;color:#526057}
    .orb{position:absolute;width:410px;height:410px;border-radius:50%;background:#e2f6e5;left:804px;top:126px}
    .card{position:absolute;left:776px;top:114px;width:376px;height:422px;background:#ebd7ff;border:1px solid #d8c4e8;border-radius:32px;transform:rotate(8deg);box-shadow:0 20px 0 #0d67310a}
    .card label{position:absolute;bottom:24px;left:30px;font-size:14px;letter-spacing:2px;font-weight:700;color:#6a408c}
    img{position:absolute;object-fit:contain}.mascot{width:440px;height:420px;left:728px;top:119px;transform:rotate(-7deg)}
    .mint{width:142px;height:142px;left:1110px;top:65px;transform:rotate(18deg)}
    .star{width:122px;height:122px;left:674px;top:66px;transform:rotate(-13deg)}
    .ticket{width:144px;height:144px;left:1040px;top:468px;transform:rotate(-19deg)}
    .ribbon{width:122px;height:122px;left:646px;top:445px;transform:rotate(-18deg)}
    .pill{position:absolute;right:54px;top:40px;border:1px solid #0d6731;border-radius:99px;padding:8px 13px;font-size:11px;font-weight:750;letter-spacing:1.5px;background:#fff;color:#0d6731}
  </style><main><div class="grid"></div><div class="copy"><div class="brand">EGZ <span>studio</span></div><p class="eyebrow">CAMERA PLAYGROUND</p><h1>Your hands.<br>Your playground.</h1><p class="features">Effects. Painting. Photobooth. Memes.</p><span class="open">Open the studio</span><span class="address">egz-gesture-studio.netlify.app</span></div><div class="orb"></div><div class="card"><label>READY FOR YOUR CLOSE-UP</label></div><img class="mascot" src="${assets.mascot}" alt="EGZ mascot"><img class="mint" src="${assets.mint}" alt=""><img class="star" src="${assets.star}" alt=""><img class="ticket" src="${assets.ticket}" alt=""><img class="ribbon" src="${assets.ribbon}" alt=""><span class="pill">PLAY MODE: ON</span></main></html>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  const output = resolve(root, 'docs/media/cover.png');
  await mkdir(resolve(root, 'docs/media'), { recursive: true });
  await page.screenshot({ path: output });
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1280); assert.equal(metadata.height, 640);
  assert.ok((await readFile(output)).length < 1024 * 1024, 'GitHub social preview must remain below 1 MiB');
  console.log('Repository cover rendered from the five existing EGZ assets (1280 x 640).');
} finally { await browser.close(); }
