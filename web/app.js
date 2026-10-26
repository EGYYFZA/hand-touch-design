import { describeHand, automaticEffect, canvasPoint, MemeLatch, distance, clamp } from './gestures.js';

const $ = id => document.getElementById(id);
const video = $('video'), preview = $('preview'), ctx = preview.getContext('2d');
const raw = document.createElement('canvas'), rawCtx = raw.getContext('2d');
const paint = document.createElement('canvas'), paintCtx = paint.getContext('2d');
const small = document.createElement('canvas'), smallCtx = small.getContext('2d');
const titles = { free: ['Efek Tangan', 'Peace untuk blur. Dua tangan L untuk efek area.'],
  painting: ['Painting', 'Cubit atau gunakan mouse untuk menggambar.'],
  photobooth: ['Photobooth', 'Tiga jepretan, satu cerita. Siapkan pose terbaik Anda.'],
  meme: ['Meme', 'Padukan ekspresi wajah dan gerakan tangan.'] };
let mode = 'free', effect = 'auto', meme = 'auto', erasing = false, lastPaint = null, pointerDown = false;
let stream = null, live = false, starting = false, generation = 0;
let worker = null, visionReady = false, visionBusy = false, hands = [], face = null, shapes = {};
let lastVideoTime = -1, lastFreshAt = 0, lastInferenceAt = 0, lastResultAt = 0, lastRender = 0;
let session = null, fistSince = null, fistArmed = true, photos = [], photoNumber = 0;
let latch = new MemeLatch(), renderMeme = null, printing = false;

function feedback(message, error = false) {
  $('feedback').textContent = message;
  $('feedback').classList.toggle('error', error);
}

function resize(width, height) {
  if (preview.width === width && preview.height === height && paint.width === width) return;
  const previous = document.createElement('canvas');
  previous.width = paint.width; previous.height = paint.height;
  if (paint.width) previous.getContext('2d').drawImage(paint, 0, 0);
  for (const canvas of [raw, preview, paint]) { canvas.width = width; canvas.height = height; }
  if (previous.width) paintCtx.drawImage(previous, 0, 0, width, height);
  lastPaint = null;
}

function chooseMode(next) {
  if (session && next !== mode) { feedback('Selesaikan atau batalkan sesi foto sebelum pindah mode.', true); return; }
  mode = next; lastPaint = null; pointerDown = false; latch = new MemeLatch(); renderMeme = null;
  $('mode-title').textContent = titles[mode][0]; $('mode-description').textContent = titles[mode][1];
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  $('effects').hidden = mode !== 'free'; $('paint-tools').hidden = mode !== 'painting'; $('meme-tools').hidden = mode !== 'meme';
  $('capture').replaceChildren(document.createTextNode(mode === 'photobooth' ? 'Mulai sesi ' : 'Ambil foto '));
  const key = document.createElement('kbd'); key.textContent = mode === 'photobooth' ? 'Spasi' : 'S'; $('capture').append(key);
  $('hint').textContent = { free: 'Peace: blur · Dua L atas: blur area · L beda arah: mosaik · Dua L bawah: putar',
    painting: 'Cubit untuk melukis, atau drag dengan mouse. Pilih warna, kuas, dan penghapus di atas.',
    photobooth: 'Kepalkan tangan selama setengah detik, tekan Spasi, atau klik Mulai sesi.',
    meme: 'Telunjuk + senyum: ide · Lidah: bleh · Jari di mulut: malu · Dua tangan + kaget: shock' }[mode];
  feedback(`Mode ${titles[mode][0]} dipilih.`);
}

function startVision() {
  if (worker) return;
  const current = new Worker(new URL('./vision-worker.js', import.meta.url), { type: 'module' });
  worker = current;
  const failed = message => {
    if (worker !== current) return;
    console.warn('MediaPipe initialization/inference failed:', message);
    current.terminate(); worker = null; visionReady = false; visionBusy = false;
    $('tracking-state').textContent = 'Gestur belum tersedia; gunakan tombol.';
    feedback('Model gestur belum bisa dimuat. Tombol tetap berfungsi. Matikan lalu aktifkan kamera untuk mencoba lagi.', true);
  };
  current.onerror = event => failed(event.message);
  current.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (data.type === 'ready') { visionReady = true; $('tracking-state').textContent = 'Gestur siap. Tunjukkan tangan Anda.'; }
    else if (data.type === 'error') failed(data.message);
    else if (data.type === 'result') {
      visionBusy = false; lastResultAt = performance.now();
      hands = data.landmarks.map(points => describeHand(points.map(p => ({ ...p, x: 1 - p.x }))));
      face = data.face?.map(p => ({ ...p, x: 1 - p.x })) || null;
      shapes = Object.fromEntries(data.shapes.map(shape => [shape.categoryName, shape.score]));
      if (mode === 'painting' && !pointerDown) {
        const hand = hands[0];
        drawStroke(hand && hand.pinch < 0.45 ? { x: hand.paint.x * paint.width, y: hand.paint.y * paint.height } : null);
      }
      if (mode === 'photobooth') {
        const fist = hands.some(hand => hand.pose === 'fist');
        if (!fist) { fistSince = null; fistArmed = true; }
        else if (fistArmed && !session) {
          fistSince ??= performance.now();
          if (performance.now() - fistSince > 500) { beginSession(); fistArmed = false; }
        }
      }
      $('tracking-state').textContent = mode === 'meme' ? (face ? 'Wajah terdeteksi' : 'Wajah belum terlihat') :
        (hands.length ? `${hands.length} tangan terdeteksi` : 'Tunjukkan tangan untuk mulai');
    }
  };
  current.postMessage({ type: 'init' });
}

async function startCamera() {
  if (starting || live) return;
  if (!navigator.mediaDevices?.getUserMedia) { feedback('Kamera memerlukan HTTPS atau localhost dan browser yang mendukung kamera.', true); return; }
  const request = ++generation;
  starting = true; $('start-camera').disabled = true; $('start-camera').textContent = 'Menghubungkan...';
  $('camera-message').textContent = 'Izinkan akses kamera pada browser. Mikrofon tidak digunakan.';
  try {
    const next = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    if (request !== generation) { next.getTracks().forEach(track => track.stop()); return; }
    stream = next; video.srcObject = next;
    await video.play();
    if (request !== generation) return;
    resize(video.videoWidth, video.videoHeight);
    live = true; lastFreshAt = performance.now(); lastVideoTime = -1;
    next.getVideoTracks()[0].addEventListener('ended', () => { if (stream === next) stopCamera('Kamera terputus. Sambungkan kembali lalu aktifkan kamera.'); });
    $('empty-state').hidden = true; $('capture').disabled = false; $('stop-camera').disabled = false;
    $('camera-state').textContent = 'KAMERA AKTIF'; $('camera-state').className = 'badge live';
    $('tracking-state').textContent = 'Menyiapkan model gestur...';
    if (session?.paused) { session.nextAt = performance.now() + session.remaining; session.paused = false; }
    feedback('Kamera aktif. Ambil foto, atau pilih mode untuk mulai.'); startVision();
  } catch (error) {
    if (request !== generation) return;
    const message = error.name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan kamera melalui pengaturan situs lalu coba lagi.' :
      error.name === 'NotFoundError' ? 'Kamera tidak ditemukan. Sambungkan kamera lalu coba lagi.' : 'Kamera tidak dapat dibuka. Tutup aplikasi kamera lain lalu coba lagi.';
    stopCamera(message); feedback(message, true);
  } finally {
    if (request === generation || !live) {
      starting = false; $('start-camera').disabled = false; $('start-camera').textContent = 'Aktifkan kamera';
    }
  }
}

function stopCamera(message = 'Kamera dimatikan. Foto yang sudah diambil tetap tersedia di bawah.') {
  ++generation; live = false; starting = false;
  if (session && !session.paused) { session.remaining = Math.max(0, session.nextAt - performance.now()); session.paused = true; }
  const previous = stream; stream = null;
  previous?.getTracks().forEach(track => track.stop()); video.srcObject = null;
  worker?.terminate(); worker = null; visionReady = false; visionBusy = false; hands = []; face = null;
  lastPaint = null; pointerDown = false; fistSince = null; fistArmed = true;
  ctx.clearRect(0, 0, preview.width, preview.height);
  $('empty-state').hidden = false; $('camera-message').textContent = message;
  $('camera-state').textContent = 'KAMERA TIDAK AKTIF'; $('camera-state').className = 'badge';
  $('capture').disabled = true; $('stop-camera').disabled = true; $('countdown').hidden = true;
  $('tracking-state').textContent = session ? 'Sesi foto dijeda. Aktifkan kamera untuk melanjutkan.' : 'Kamera tidak aktif.';
  $('fps').textContent = ''; feedback(message);
}

function drawStroke(point) {
  if (!point) { lastPaint = null; return; }
  paintCtx.save(); paintCtx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  paintCtx.strokeStyle = $('paint-color').value; paintCtx.fillStyle = $('paint-color').value;
  paintCtx.lineWidth = Number($('brush-size').value) * (erasing ? 3 : 1);
  paintCtx.lineCap = 'round'; paintCtx.lineJoin = 'round';
  if (lastPaint) { paintCtx.beginPath(); paintCtx.moveTo(lastPaint.x, lastPaint.y); paintCtx.lineTo(point.x, point.y); paintCtx.stroke(); }
  else { paintCtx.beginPath(); paintCtx.arc(point.x, point.y, paintCtx.lineWidth / 2, 0, Math.PI * 2); paintCtx.fill(); }
  paintCtx.restore(); lastPaint = point;
}

function drawEffect(config) {
  if (config.name === 'none') return;
  const w = preview.width, h = preview.height;
  const area = config.rect || { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.floor(area.x * w), y = Math.floor(area.y * h);
  const aw = Math.max(1, Math.min(w - x, Math.ceil(area.w * w))), ah = Math.max(1, Math.min(h - y, Math.ceil(area.h * h)));
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, aw, ah); ctx.clip();
  if (config.name === 'blur') { ctx.filter = `blur(${config.radius || 12}px)`; ctx.drawImage(raw, 0, 0); }
  else if (config.name === 'mosaic') {
    small.width = 18; small.height = Math.max(1, Math.round(18 * ah / aw));
    smallCtx.drawImage(raw, x, y, aw, ah, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(small, x, y, aw, ah);
  } else if (config.name === 'flip') {
    ctx.translate(x + aw, y + ah); ctx.scale(-1, -1); ctx.drawImage(raw, x, y, aw, ah, 0, 0, aw, ah);
  }
  ctx.restore();
}

function memeScores() {
  if (!face) return {};
  const smile = Math.max(shapes.mouthSmileLeft || 0, shapes.mouthSmileRight || 0);
  const mouth = { x: (face[13].x + face[14].x) / 2, y: (face[13].y + face[14].y) / 2 };
  const near = distance(face[234], face[454]) * 0.75;
  const shock = clamp(0.75 * (shapes.jawOpen || 0) + 0.5 * Math.max(shapes.eyeWideLeft || 0, shapes.eyeWideRight || 0, shapes.browInnerUp || 0), 0, 1);
  // shortcut: tongue uses a color heuristic; replace with a trained detector if calibrated accuracy is required.
  let tongue = 0;
  if ((shapes.jawOpen || 0) > 0.15) {
    const size = Math.max(4, Math.round(distance(face[61], face[291]) * raw.width * 0.55));
    const x = clamp(Math.round(mouth.x * raw.width - size / 2), 0, raw.width - size);
    const y = clamp(Math.round(face[14].y * raw.height), 0, raw.height - size);
    const pixels = rawCtx.getImageData(x, y, size, size).data;
    let pink = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 80 && pixels[i] > pixels[i + 1] * 1.2 && pixels[i] > pixels[i + 2] * 1.1) pink++;
    tongue = clamp((pink / (pixels.length / 4) - 0.18) / 0.32, 0, 1);
  }
  return { idea: hands.some(hand => hand.pose === 'point' && hand.points[8].y < hand.points[5].y) ? smile : 0,
    clingy: hands.some(hand => distance(hand.points[8], mouth) < near) ? smile : 0,
    shock: hands.filter(hand => hand.points[0].y > mouth.y).length >= 2 ? shock : 0, tongue };
}

function drawMeme(name) {
  if (!name) return;
  const label = { idea: 'IDE!', tongue: 'BLEH!', clingy: 'MALU...', shock: 'KAGET!' }[name];
  ctx.save(); const w = preview.width, h = preview.height;
  const size = Math.round(h * 0.16); ctx.font = `800 ${size}px system-ui`;
  const tw = ctx.measureText(label).width, x = w - tw - 70, y = 70;
  ctx.fillStyle = '#a1e6b9'; ctx.beginPath(); ctx.roundRect(x - 24, y - 24, tw + 48, size + 56, 22); ctx.fill();
  ctx.fillStyle = '#1f2b27'; ctx.textBaseline = 'top'; ctx.fillText(label, x, y); ctx.restore();
}

function beginSession() {
  if (!live || session) return;
  if (photos.length >= 12) { feedback('Sesi penuh. Unduh dan hapus beberapa foto sebelum mengambil lagi.', true); return; }
  session = { shots: [], nextAt: performance.now() + 3000, paused: false, remaining: 3000 };
  $('cancel-session').hidden = false; $('capture').disabled = true; feedback('Sesi dimulai. Tiga foto akan diambil.');
}

function cancelSession() {
  session = null; $('countdown').hidden = true; $('cancel-session').hidden = true; $('capture').disabled = !live;
  feedback('Sesi dibatalkan. Foto tersimpan sebelumnya tetap tersedia.');
}

function snapshot() {
  const copy = document.createElement('canvas'); copy.width = preview.width; copy.height = preview.height;
  copy.getContext('2d').drawImage(preview, 0, 0); return copy;
}

async function savePhoto(canvas, kind = mode) {
  if (photos.length >= 12) { feedback('Sesi penuh. Unduh dan hapus beberapa foto sebelum mengambil lagi.', true); return; }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) { feedback('Foto gagal diproses. Coba ambil kembali.', true); return; }
  if (photos.length >= 12) { feedback('Sesi penuh. Unduh dan hapus foto sebelum mengambil lagi.', true); return; }
  const entry = { id: ++photoNumber, url: URL.createObjectURL(blob), name: `gesturecanvas-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.png` };
  photos.push(entry);
  const card = document.createElement('article'); card.className = 'photo-card'; card.dataset.photo = entry.id;
  const image = new Image(); image.src = entry.url; image.alt = `Foto ${kind} ${entry.id}`;
  const title = document.createElement('p'); title.textContent = entry.name;
  const actions = document.createElement('div'); actions.className = 'photo-actions';
  const download = document.createElement('a'); download.href = entry.url; download.download = entry.name; download.textContent = 'Unduh PNG';
  const print = document.createElement('button'); print.textContent = 'Print'; print.dataset.print = entry.id;
  print.addEventListener('click', () => printPhoto(entry));
  const remove = document.createElement('button'); remove.textContent = 'Hapus';
  remove.addEventListener('click', () => {
    if (!confirm('Hapus foto ini dari sesi browser? Unduh dahulu jika ingin menyimpannya.')) return;
    photos = photos.filter(photo => photo !== entry); URL.revokeObjectURL(entry.url); card.remove();
    $('saved-section').hidden = !photos.length;
  });
  actions.append(download, print, remove); card.append(image, title, actions);
  $('saved-photos').prepend(card); $('saved-section').hidden = false;
  feedback('Foto siap. Unduh PNG untuk menyimpan permanen, atau klik Print.');
}

async function printPhoto(entry) {
  if (printing || !photos.includes(entry)) return;
  printing = true;
  const image = new Image(); image.src = entry.url; image.alt = 'Foto yang dipilih untuk dicetak';
  $('print-area').replaceChildren(image);
  try { await image.decode(); window.print(); feedback('Dialog cetak ditutup. Foto tetap tersedia di sesi ini.'); }
  catch { feedback('Pratinjau cetak gagal. Unduh PNG dan cetak melalui aplikasi foto Anda.', true); }
  finally { printing = false; }
}

async function capture() {
  if (!live || performance.now() - lastFreshAt > 1000) { feedback('Kamera belum siap. Aktifkan kamera lalu coba lagi.', true); return; }
  if (mode === 'photobooth') beginSession();
  else await savePhoto(snapshot());
}

function render(now) {
  requestAnimationFrame(render);
  if (!live || video.readyState < 2) return;
  if (video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; lastFreshAt = now; }
  if (now - lastFreshAt > 1000) { stopCamera('Kamera tidak mengirim gambar baru. Aktifkan kembali kamera.'); return; }
  if (now - lastResultAt > 1000) { hands = []; face = null; lastPaint = null; }
  rawCtx.save(); rawCtx.setTransform(-1, 0, 0, 1, raw.width, 0); rawCtx.drawImage(video, 0, 0, raw.width, raw.height); rawCtx.restore();
  ctx.drawImage(raw, 0, 0);
  if (mode === 'free') drawEffect(effect === 'auto' ? automaticEffect(hands) : { name: effect });
  if (mode === 'painting') ctx.drawImage(paint, 0, 0);
  if (mode === 'meme') { renderMeme = meme === 'auto' ? latch.update(memeScores(), now) : meme; drawMeme(renderMeme); }
  if (session && !session.paused) {
    const remaining = session.nextAt - now;
    $('countdown').hidden = false; $('countdown').textContent = remaining > 0 ? Math.ceil(remaining / 1000) : '';
    if (remaining <= 0) {
      session.shots.push(snapshot());
      if (session.shots.length === 3) {
        const strip = document.createElement('canvas'); strip.width = preview.width;
        strip.height = preview.height * 3 + 24;
        const stripCtx = strip.getContext('2d'); stripCtx.fillStyle = '#f5f6f3'; stripCtx.fillRect(0, 0, strip.width, strip.height);
        session.shots.forEach((shot, i) => stripCtx.drawImage(shot, 0, i * (preview.height + 12)));
        session = null; $('countdown').hidden = true; $('cancel-session').hidden = true; $('capture').disabled = false;
        savePhoto(strip, 'photobooth');
      } else session.nextAt = now + 3000;
    }
  }
  if (visionReady && !visionBusy && now - lastInferenceAt > 66) {
    visionBusy = true; lastInferenceAt = now; const current = worker;
    createImageBitmap(video).then(image => {
      if (worker !== current || !live) { image.close(); return; }
      current.postMessage({ type: 'frame', image, timestamp: now, face: mode === 'meme' }, [image]);
    }).catch(() => { visionBusy = false; });
  }
  if (lastRender && now - lastRender > 0) $('fps').textContent = `${Math.round(1000 / (now - lastRender))} FPS`;
  lastRender = now;
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => chooseMode(button.dataset.mode)));
for (const [attribute, setter] of [['effect', value => effect = value], ['meme', value => meme = value]]) {
  document.querySelectorAll(`[data-${attribute}]`).forEach(button => button.addEventListener('click', () => {
    setter(button.dataset[attribute]);
    document.querySelectorAll(`[data-${attribute}]`).forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  }));
}
$('start-camera').addEventListener('click', startCamera); $('stop-camera').addEventListener('click', () => stopCamera());
$('capture').addEventListener('click', capture); $('cancel-session').addEventListener('click', cancelSession);
$('clear-paint').addEventListener('click', () => { paintCtx.clearRect(0, 0, paint.width, paint.height); lastPaint = null; });
$('eraser').addEventListener('click', () => { erasing = !erasing; $('eraser').setAttribute('aria-pressed', String(erasing)); });
preview.addEventListener('pointerdown', event => {
  if (mode !== 'painting' || !live) return;
  pointerDown = true; lastPaint = null; preview.setPointerCapture(event.pointerId);
  drawStroke(canvasPoint(event.clientX, event.clientY, preview.getBoundingClientRect(), preview.width, preview.height));
});
preview.addEventListener('pointermove', event => { if (pointerDown) drawStroke(canvasPoint(event.clientX, event.clientY, preview.getBoundingClientRect(), preview.width, preview.height)); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) preview.addEventListener(name, () => { pointerDown = false; lastPaint = null; });
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.repeat) return;
  if (event.code === 'Space' && event.target.tagName === 'BUTTON') return;
  if (/^[1-4]$/.test(event.key)) chooseMode(['free', 'painting', 'photobooth', 'meme'][Number(event.key) - 1]);
  else if (event.key.toLowerCase() === 's' || event.code === 'Space') { event.preventDefault(); capture(); }
  else if (event.key.toLowerCase() === 'p' && photos.length) { event.preventDefault(); printPhoto(photos.at(-1)); }
  else if (event.key === 'Escape' && session) cancelSession();
});
window.addEventListener('beforeunload', event => {
  if (photos.length || session?.shots.length) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && live) stopCamera('Kamera dijeda karena halaman tidak aktif. Aktifkan kembali untuk melanjutkan.'); });
requestAnimationFrame(render);
