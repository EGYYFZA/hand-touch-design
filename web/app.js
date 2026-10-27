import { describeHand, automaticEffect, canvasPoint, MemeLatch, distance, clamp, DwellSelector, screenPoint, shapeBounds, hsvToHex, expressionScores, smoothPoint } from './gestures.js';

const $ = id => document.getElementById(id);
const video = $('video'), preview = $('preview'), ctx = preview.getContext('2d');
const raw = document.createElement('canvas'), rawCtx = raw.getContext('2d');
const paint = document.createElement('canvas'), paintCtx = paint.getContext('2d');
const small = document.createElement('canvas'), smallCtx = small.getContext('2d');
const titles = { free: 'Efek Tangan', painting: 'Painting', photobooth: 'Photobooth', meme: 'Meme' };
let mode = 'free', erasing = false, lastPaint = null, pointerDown = false;
let stream = null, live = false, starting = false, generation = 0;
let worker = null, visionReady = false, visionBusy = false, hands = [], face = null, shapes = {};
let lastVideoTime = -1, lastFreshAt = 0, lastInferenceAt = 0, lastResultAt = 0;
let session = null, fistSince = null, fistArmed = true, photos = [], photoNumber = 0;
let latch = new MemeLatch(), renderMeme = null, printing = false;
let phase = 'setup', calibrationStep = 'palms', manual = false;
let dwell = new DwellSelector(), calibrationHold = new DwellSelector(), cursorPoint = null, hovered = null;
let paintTool = 'brush', draftShape = null, undoImage = null, hue = 198, saturation = 0.77, brightness = 0.97;
let shutterUntil = 0, shownMeme = null, gesturePaintActive = false, lastMemeAt = 0;
let spatialPoint = null, lastActivationPoint = null;
let keyboardDrawing = false;
let saving = false, pendingSave = null;
let cursorTarget = null, cursorFrameAt = 0, paintPoint = null, paintPointAt = 0, galleryIndex = 0;
const memeImages = Object.fromEntries(['clingy', 'idea', 'shock', 'tongue'].map(name => {
  const image = new Image(); image.src = `memes/${name}.webp`;
  image.onerror = () => feedback(`Aset ${name} gagal dimuat. Muat ulang halaman untuk mencoba lagi.`, true);
  return [name, image];
}));

function enterStudio() {
  if (!live || (!manual && calibrationStep !== 'point')) return;
  phase = 'menu'; document.body.dataset.phase = phase;
  $('calibration').hidden = true; $('mode-tools').hidden = false;
  $('mode-nav').inert = false; $('menu-screen').hidden = false; $('capture').disabled = true;
  $('mode-title').textContent = 'Pilih mode';
  $('mode-title').tabIndex = -1; $('mode-title').focus({ preventScroll: true });
  feedback('');
}

function resetCursor() {
  hovered?.classList.remove('gesture-hover'); hovered = null; cursorPoint = null;
  dwell = new DwellSelector(); $('gesture-cursor').hidden = true;
  spatialPoint = null; lastActivationPoint = null;
  cursorTarget = null; cursorFrameAt = 0;
}

function trackPointer(now) {
  if (!live) return;
  if (phase === 'setup') {
    if (calibrationStep === 'palms') {
      const palms = hands.length === 2 && hands.every(hand => hand.pose === 'open' && hand.palm > 0.07 && hand.points.every(p => p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98));
      const ready = calibrationHold.update(palms ? 'palms' : null, now, 1000);
      $('calibration-progress').value = calibrationHold.progress;
      if (ready) {
        calibrationStep = 'point'; $('calibration-step').textContent = '02 / COBA KURSOR';
        $('calibration-title').textContent = 'Sekarang, satu telunjuk.';
        $('calibration-copy').textContent = 'Arahkan kursor ke tombol di bawah. Tahan 0,8 detik.';
        $('calibration-progress').hidden = true; $('enter-studio').hidden = false;
      }
      return;
    }
  }
  const pointing = hands.filter(hand => hand.pose === 'point');
  const hand = cursorPoint ? pointing.sort((a, b) => distance(screenPoint(a.points[8], innerWidth, innerHeight), cursorPoint) - distance(screenPoint(b.points[8], innerWidth, innerHeight), cursorPoint))[0] : pointing[0];
  if (!hand) { resetCursor(); return; }
  cursorTarget = screenPoint(hand.points[8], innerWidth, innerHeight);
}

function gestureControls(now) {
  if (!cursorTarget) return;
  const elapsed = cursorFrameAt ? Math.min(now - cursorFrameAt, 50) : 16;
  cursorFrameAt = now;
  cursorPoint = smoothPoint(cursorPoint, cursorTarget, elapsed, cursorPoint && distance(cursorPoint, cursorTarget) > 100 ? 35 : 65);
  const cursor = $('gesture-cursor'); cursor.hidden = false; cursor.style.left = `${cursorPoint.x}px`; cursor.style.top = `${cursorPoint.y}px`;
  const hit = document.elementFromPoint(cursorPoint.x, cursorPoint.y);
  let target = hit?.closest('button, a[download], input[type=range], #color-field');
  if (target?.disabled || target?.closest('[inert]') || (phase === 'setup' && target?.id !== 'enter-studio')) target = null;
  // A new control appearing under a held finger must not activate by itself.
  if (lastActivationPoint && distance(cursorPoint, lastActivationPoint) < 20) target = null;
  else lastActivationPoint = null;
  if (hovered !== target) { hovered?.classList.remove('gesture-hover'); hovered = target; hovered?.classList.add('gesture-hover'); }
  if (target?.matches('input[type=range], #color-field')) {
    if (!spatialPoint || distance(cursorPoint, spatialPoint) > 14) { spatialPoint = { ...cursorPoint }; dwell.update(null, now); }
    if (dwell.update(target, now)) setSpatialControl(target, cursorPoint.x, cursorPoint.y);
  } else {
    spatialPoint = null;
    if (dwell.update(target, now)) { lastActivationPoint = { ...cursorPoint }; target.click(); }
  }
  $('cursor-progress').style.strokeDashoffset = String(100 - dwell.progress * 100);
}

function rememberPaint() { undoImage = paintCtx.getImageData(0, 0, paint.width, paint.height); $('undo-paint').disabled = false; }

function drawShape(context, bounds) {
  const x = bounds.x * paint.width, y = bounds.y * paint.height, w = bounds.w * paint.width, h = bounds.h * paint.height;
  context.save(); context.strokeStyle = $('paint-color').value; context.lineWidth = Number($('brush-size').value); context.lineJoin = 'round'; context.beginPath();
  if (paintTool === 'circle') context.arc(x + w / 2, y + h / 2, Math.max(Math.min(w, h) / 2, 0.1), 0, Math.PI * 2);
  else if (paintTool === 'square') context.rect(x, y, w, h);
  else { context.moveTo(x + w / 2, y); context.lineTo(x + w, y + h); context.lineTo(x, y + h); context.closePath(); }
  context.stroke(); context.restore();
}

function paintGesture() {
  if (phase !== 'studio' || mode !== 'painting' || pointerDown || keyboardDrawing || $('saved-section').open) return;
  if (paintTool !== 'brush') {
    const bounds = shapeBounds(hands);
    if (bounds) draftShape = bounds;
    else if (draftShape) {
      // Tracking loss cancels a preview; an observed release commits it.
      if (hands.length === 2) { rememberPaint(); drawShape(paintCtx, draftShape); }
      draftShape = null;
    }
    return;
  }
  const hand = hands[0];
  const point = hand?.pose === 'pinch' && hand.pinch < 0.45 && !hovered && $('color-picker').hidden && !$('saved-section').open ? { x: hand.paint.x * paint.width, y: hand.paint.y * paint.height } : null;
  if (point && !gesturePaintActive) rememberPaint();
  const now = performance.now();
  paintPoint = point ? smoothPoint(gesturePaintActive ? paintPoint : null, point, now - paintPointAt, 45) : null;
  paintPointAt = now; gesturePaintActive = !!point; drawStroke(paintPoint);
}

function updateColor() {
  const color = hsvToHex(hue, saturation, brightness); $('paint-color').value = color;
  $('color-swatch').style.background = color; $('color-value').textContent = color.toUpperCase();
  $('color-field').style.background = `linear-gradient(0deg,#000,transparent),linear-gradient(90deg,#fff,transparent),hsl(${hue} 100% 50%)`;
  $('color-marker').style.left = `${saturation * 100}%`; $('color-marker').style.top = `${(1 - brightness) * 100}%`;
  $('color-field').setAttribute('aria-valuenow', String(Math.round(saturation * 100)));
  $('color-field').setAttribute('aria-valuetext', `Saturasi ${Math.round(saturation * 100)}%, kecerahan ${Math.round(brightness * 100)}%`);
}

function setSpatialControl(element, x, y) {
  const rect = element.getBoundingClientRect();
  if (element.id === 'color-field') { saturation = clamp((x - rect.left) / rect.width, 0, 1); brightness = 1 - clamp((y - rect.top) / rect.height, 0, 1); updateColor(); }
  else { element.value = Math.round(Number(element.min) + clamp((x - rect.left) / rect.width, 0, 1) * (Number(element.max) - Number(element.min))); element.dispatchEvent(new Event('input')); }
}

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
  lastPaint = null; undoImage = null; draftShape = null; $('undo-paint').disabled = true;
}

function chooseMode(next) {
  if (phase === 'setup' || !titles[next]) return;
  if (session && next !== mode) { feedback('Selesaikan atau batalkan sesi foto sebelum pindah mode.', true); return; }
  phase = 'studio'; document.body.dataset.phase = phase; document.body.dataset.mode = next;
  keyboardDrawing = false;
  $('menu-screen').hidden = true; $('capture').disabled = !live || !!session || !!pendingSave;
  mode = next; lastPaint = null; pointerDown = false; latch = new MemeLatch(); renderMeme = null;
  draftShape = null; gesturePaintActive = false; fistSince = null; fistArmed = true; face = null; shapes = {}; showMeme(null);
  $('mode-title').textContent = titles[mode];
  document.querySelectorAll('button[data-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  $('effects').hidden = mode !== 'free'; $('paint-tools').hidden = mode !== 'painting'; $('meme-tools').hidden = mode !== 'meme';
  $('booth-tools').hidden = mode !== 'photobooth';
  $('tool-panel').hidden = false; $('toggle-tools').hidden = false; $('toggle-tools').setAttribute('aria-expanded', 'true');
  $('capture').replaceChildren(document.createTextNode(mode === 'photobooth' ? 'Mulai sesi ' : 'Ambil foto '));
  const key = document.createElement('kbd'); key.textContent = mode === 'photobooth' ? 'Spasi' : 'S'; $('capture').append(key);
  $('mode-title').focus({ preventScroll: true });
  feedback('');
}

function startVision() {
  if (worker) return;
  const current = new Worker(new URL('./vision-worker.js', import.meta.url), { type: 'module' });
  worker = current;
  const initTimeout = setTimeout(() => failed('Waktu pemuatan model habis.'), 30000);
  const failed = message => {
    if (worker !== current) return;
    clearTimeout(initTimeout);
    console.warn('MediaPipe initialization/inference failed:', message);
    current.terminate(); worker = null; visionReady = false; visionBusy = false;
    hands = []; face = null; draftShape = null; resetCursor();
    $('tracking-state').textContent = 'Gestur belum tersedia.';
    feedback('Model gestur gagal dimuat. Matikan lalu aktifkan kamera untuk mencoba lagi, atau gunakan kontrol tombol.', true);
  };
  current.onerror = event => failed(event.message);
  current.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (data.type === 'ready') { clearTimeout(initTimeout); visionReady = true; $('tracking-state').textContent = 'Gestur siap. Tunjukkan tangan Anda.'; }
    else if (data.type === 'face-error') feedback('Model wajah gagal dimuat. Pindah mode lalu kembali ke Meme untuk mencoba lagi.', true);
    else if (data.type === 'error') failed(data.message);
    else if (data.type === 'result') {
      visionBusy = false;
      if (data.mode !== mode || performance.now() - data.timestamp > 350) return;
      if (performance.now() - lastResultAt > 350) fistSince = null;
      lastResultAt = performance.now();
      hands = data.landmarks.map(points => describeHand(points.map(p => ({ ...p, x: 1 - p.x }))));
      face = mode === 'meme' && data.mode === mode ? data.face?.map(p => ({ ...p, x: 1 - p.x })) || null : null;
      shapes = Object.fromEntries(data.shapes.map(shape => [shape.categoryName, shape.score]));
      trackPointer(lastResultAt);
      paintGesture();
      if (mode === 'photobooth' && phase === 'studio' && !$('saved-section').open) {
        const fist = hands.some(hand => hand.pose === 'fist');
        if (!fist) { fistSince = null; if (hands.length) fistArmed = true; }
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
    $('empty-state').hidden = true; $('capture').disabled = phase !== 'studio' || !!session || !!pendingSave; $('stop-camera').disabled = false;
    $('camera-state').textContent = 'KAMERA AKTIF'; $('camera-state').className = 'badge live';
    $('tracking-state').textContent = 'Menyiapkan model gestur...';
    if (session?.paused) { session.nextAt = performance.now() + session.remaining; session.paused = false; }
    if (phase === 'setup') {
      calibrationStep = 'palms'; calibrationHold = new DwellSelector();
      $('calibration').hidden = false; $('calibration-progress').hidden = false; $('calibration-progress').value = 0;
      $('enter-studio').hidden = true; $('calibration-step').textContent = '01 / KENALI TANGAN';
      $('calibration-title').textContent = 'Buka kedua telapak tangan.';
      $('calibration-copy').textContent = 'Posisikan di depan kamera. Tahan hingga indikator penuh.';
    }
    if (phase === 'menu') $('menu-screen').hidden = false;
    feedback(''); startVision();
    if (manual && phase === 'setup') enterStudio();
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

function stopCamera(message = 'Kamera dimatikan. Foto tersimpan di Hasil.') {
  ++generation; live = false; starting = false;
  if (session && !session.paused) { session.remaining = Math.max(0, session.nextAt - performance.now()); session.paused = true; }
  const previous = stream; stream = null;
  previous?.getTracks().forEach(track => track.stop()); video.srcObject = null;
  worker?.terminate(); worker = null; visionReady = false; visionBusy = false; hands = []; face = null;
  resetCursor(); draftShape = null; gesturePaintActive = false; latch = new MemeLatch(); showMeme(null);
  $('calibration').hidden = true; $('menu-screen').hidden = true; $('shutter').hidden = true; $('shot-feedback').hidden = true;
  lastPaint = null; pointerDown = false; fistSince = null; fistArmed = true;
  ctx.clearRect(0, 0, preview.width, preview.height);
  $('empty-state').hidden = false; $('camera-message').textContent = message;
  $('camera-state').textContent = 'KAMERA TIDAK AKTIF'; $('camera-state').className = 'badge';
  $('capture').disabled = true; $('stop-camera').disabled = true; $('countdown').hidden = true;
  $('tracking-state').textContent = session ? 'Sesi foto dijeda. Aktifkan kamera untuk melanjutkan.' : 'Kamera tidak aktif.';
  feedback(message);
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
  // shortcut: tongue color is lighting-sensitive; replace with a trained tongue detector for calibrated accuracy.
  let tongue = 0;
  if ((shapes.jawOpen || 0) > 0.15) {
    const size = clamp(Math.round(distance(face[61], face[291]) * raw.width * 0.5), 4, Math.min(raw.width, raw.height));
    const x = clamp(Math.round((face[13].x + face[14].x) / 2 * raw.width - size / 2), 0, raw.width - size);
    const y = clamp(Math.round(face[14].y * raw.height), 0, raw.height - size);
    const pixels = rawCtx.getImageData(x, y, size, size).data;
    let pink = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 90 && pixels[i + 1] > 35 && pixels[i] > pixels[i + 1] * 1.3 && pixels[i] > pixels[i + 2] * 1.15) pink++;
    }
    tongue = clamp((pink / (pixels.length / 4) - 0.25) / 0.4, 0, 1);
  }
  return expressionScores(hands, face, shapes, tongue);
}

function showMeme(name) {
  if (shownMeme === name) return;
  shownMeme = name;
  const image = $('meme-image'); image.hidden = !name; $('meme-wait').hidden = !!name;
  $('meme-name').textContent = name ? name[0].toUpperCase() + name.slice(1) : 'Menunggu ekspresi';
  if (name) { image.src = memeImages[name].src; image.alt = `Meme monyet ${name}, sesuai ekspresi Anda`; }
}

function drawMeme(name) {
  showMeme(name);
  const image = memeImages[name];
  if (!image?.complete || !image.naturalWidth) return;
  const view = visibleCameraRect();
  const size = Math.min(view.w, view.h) * 0.28, x = view.x + view.w - size - 24, y = view.y + view.h - size - 24;
  ctx.save(); ctx.fillStyle = '#071020'; ctx.fillRect(x - 5, y - 5, size + 10, size + 10);
  ctx.strokeStyle = '#38bdf8'; ctx.strokeRect(x - 5, y - 5, size + 10, size + 10);
  ctx.drawImage(image, x, y, size, size); ctx.restore();
}

function photoStrip(shots) {
  const strip = document.createElement('canvas'), w = shots[0].width, h = shots[0].height;
  const border = Math.round(w * 0.055), gap = Math.round(w * 0.025), header = Math.round(w * 0.13), footer = Math.round(w * 0.12);
  strip.width = w + border * 2; strip.height = header + h * 3 + gap * 2 + footer;
  const c = strip.getContext('2d'); c.fillStyle = '#071020'; c.fillRect(0, 0, strip.width, strip.height);
  c.strokeStyle = '#38bdf8'; c.lineWidth = Math.max(2, w * 0.002);
  c.strokeRect(border / 3, border / 3, strip.width - border * 2 / 3, strip.height - border * 2 / 3);
  c.fillStyle = '#a8e4ff'; c.font = `700 ${Math.round(w * 0.036)}px sans-serif`;
  c.fillText('AFTER HOURS / GESTURE STUDIO', border, header * 0.58);
  c.fillStyle = '#38bdf8';
  for (let i = 0; i < 9; i++) c.fillRect(strip.width - border - 8 * i, header * 0.8, 3, 12);
  shots.forEach((shot, i) => {
    const y = header + i * (h + gap); c.drawImage(shot, border, y, w, h);
    c.strokeStyle = '#38bdf8'; c.strokeRect(border - 2, y - 2, w + 4, h + 4);
    c.fillStyle = '#071020'; c.fillRect(border, y, w * 0.075, w * 0.05);
    c.fillStyle = '#8cdbff'; c.font = `${Math.round(w * 0.025)}px monospace`; c.fillText(`0${i + 1}`, border + w * 0.015, y + w * 0.034);
  });
  c.fillStyle = '#9bafc8'; c.font = `${Math.round(w * 0.018)}px monospace`;
  c.fillText('THREE FRAMES. ONE FREQUENCY.', border, strip.height - footer * 0.45);
  c.fillStyle = '#38bdf8'; c.font = `bold ${Math.round(w * 0.035)}px sans-serif`; c.textAlign = 'right';
  c.fillText('EGZ', strip.width - border, strip.height - footer * 0.4);
  return strip;
}

function beginSession() {
  if (!live || session || pendingSave || phase !== 'studio' || performance.now() - lastFreshAt > 1000) return;
  if (photos.length >= 12) { feedback('Sesi penuh. Unduh dan hapus beberapa foto sebelum mengambil lagi.', true); return; }
  session = { shots: [], nextAt: performance.now() + 3000, paused: false, remaining: 3000 };
  for (const item of document.querySelectorAll('.shot-list li')) item.classList.remove('taken');
  $('cancel-session').hidden = false; $('capture').disabled = true; feedback('Sesi dimulai. Tiga foto akan diambil.');
}

function cancelSession() {
  session = null; $('countdown').hidden = true; $('cancel-session').hidden = true; $('capture').disabled = !live;
  feedback('Sesi dibatalkan. Foto tersimpan sebelumnya tetap tersedia.');
  $('shutter').hidden = true; $('shot-feedback').hidden = true;
}

function visibleCameraRect() {
  const rect = preview.getBoundingClientRect(), scale = Math.max(rect.width / preview.width, rect.height / preview.height);
  const w = rect.width / scale, h = rect.height / scale;
  return { x: (preview.width - w) / 2, y: (preview.height - h) / 2, w, h };
}

function snapshot() {
  const view = visibleCameraRect(), copy = document.createElement('canvas');
  copy.width = Math.round(view.w); copy.height = Math.round(view.h);
  copy.getContext('2d').drawImage(preview, view.x, view.y, view.w, view.h, 0, 0, copy.width, copy.height); return copy;
}

function showGalleryPhoto() {
  const cards = [...$('saved-photos').children];
  galleryIndex = clamp(galleryIndex, 0, Math.max(0, cards.length - 1));
  cards.forEach((card, index) => card.hidden = index !== galleryIndex);
  $('gallery-position').textContent = `${galleryIndex + 1} / ${cards.length}`;
  $('gallery-prev').disabled = galleryIndex === 0;
  $('gallery-next').disabled = galleryIndex >= cards.length - 1;
  $('photo-count').textContent = String(cards.length); $('gallery-toggle').disabled = !cards.length;
  if (!cards.length && $('saved-section').open) $('saved-section').close();
}

function openGallery() {
  if (!photos.length) return;
  toggleColor(false); draftShape = null; lastPaint = null;
  showGalleryPhoto(); $('saved-section').append($('gesture-cursor')); $('saved-section').showModal();
}

async function savePhoto(canvas, kind = mode) {
  if (saving || (pendingSave && pendingSave.canvas !== canvas)) return;
  if (photos.length >= 12) { feedback('Sesi penuh. Unduh dan hapus beberapa foto sebelum mengambil lagi.', true); return; }
  saving = true; pendingSave = { canvas, kind }; $('capture').disabled = true; $('retry-save').disabled = true;
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
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
    const confirmDelete = document.createElement('button'); confirmDelete.textContent = 'Ya, hapus'; confirmDelete.hidden = true;
    const keep = document.createElement('button'); keep.textContent = 'Simpan di sesi'; keep.hidden = true;
    const warning = document.createElement('p'); warning.textContent = 'Unduh dahulu. Foto yang dihapus tidak bisa dipulihkan.'; warning.hidden = true; warning.className = 'delete-confirm';
    remove.addEventListener('click', () => { confirmDelete.hidden = keep.hidden = warning.hidden = false; remove.hidden = true; });
    keep.addEventListener('click', () => { confirmDelete.hidden = keep.hidden = warning.hidden = true; remove.hidden = false; });
    confirmDelete.addEventListener('click', () => {
      photos = photos.filter(photo => photo !== entry); URL.revokeObjectURL(entry.url); card.remove();
      showGalleryPhoto();
    });
    actions.append(download, print, remove, confirmDelete, keep); card.append(image, title, warning, actions);
    $('saved-photos').prepend(card); galleryIndex = 0; showGalleryPhoto();
    pendingSave = null;
    feedback('Foto siap di Hasil.');
  } catch {
    feedback('Foto gagal diproses. Gambar tetap disimpan sementara; pilih Coba simpan foto.', true);
  } finally {
    saving = false; $('retry-save').hidden = !pendingSave; $('retry-save').disabled = false;
    $('capture').disabled = !live || phase !== 'studio' || !!session || !!pendingSave;
  }
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
  if (phase !== 'studio') return;
  if (!live || performance.now() - lastFreshAt > 1000) { feedback('Kamera belum siap. Aktifkan kamera lalu coba lagi.', true); return; }
  if (mode === 'photobooth') beginSession();
  else await savePhoto(snapshot());
}

function render(now) {
  requestAnimationFrame(render);
  if (!live || video.readyState < 2) return;
  if (video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; lastFreshAt = now; }
  if (now - lastFreshAt > 1000) { stopCamera('Kamera tidak mengirim gambar baru. Aktifkan kembali kamera.'); return; }
  if (now - lastResultAt > 350) {
    hands = []; face = null; gesturePaintActive = false; resetCursor();
    if (!pointerDown && !keyboardDrawing) { lastPaint = null; draftShape = null; }
  }
  gestureControls(now);
  if (visionBusy && now - lastInferenceAt > 15000) {
    worker?.terminate(); worker = null; visionReady = false; visionBusy = false;
    feedback('Pelacakan berhenti merespons. Matikan lalu aktifkan kamera untuk mencoba lagi.', true);
  }
  rawCtx.save(); rawCtx.setTransform(-1, 0, 0, 1, raw.width, 0); rawCtx.drawImage(video, 0, 0, raw.width, raw.height); rawCtx.restore();
  ctx.drawImage(raw, 0, 0);
  if (phase === 'studio' && mode === 'free') {
    const config = automaticEffect(hands); drawEffect(config);
    $('effect-state').textContent = { none: '', blur: config.rect ? 'BLUR AREA' : 'BLUR', mosaic: 'MOSAIK', flip: 'PUTAR 180°' }[config.name];
    if (config.rect) { const r = config.rect; ctx.save(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.strokeRect(r.x * preview.width, r.y * preview.height, r.w * preview.width, r.h * preview.height); ctx.restore(); }
  } else $('effect-state').textContent = '';
  if (mode === 'painting') { ctx.drawImage(paint, 0, 0); if (draftShape) drawShape(ctx, draftShape); }
  if (phase === 'studio' && mode === 'meme') {
    if (now - lastMemeAt > 100) { renderMeme = latch.update(memeScores(), now); lastMemeAt = now; }
    drawMeme(renderMeme);
  }
  if (now > shutterUntil) { $('shutter').hidden = true; $('shot-feedback').hidden = true; }
  if (session && !session.paused) {
    const remaining = session.nextAt - now;
    $('countdown').hidden = false;
    const digit = remaining > 0 ? String(Math.ceil(remaining / 1000)) : '';
    if ($('countdown').textContent !== digit) $('countdown').textContent = digit;
    if (remaining <= 0) {
      session.shots.push(snapshot());
      const number = session.shots.length;
      $('shutter').hidden = true; void $('shutter').offsetWidth; $('shutter').hidden = false;
      shutterUntil = now + 900; $('shot-feedback').hidden = false; $('shot-feedback').textContent = `FOTO ${number} / 3 TERTANGKAP`;
      $(`shot-${number}`).classList.add('taken');
      if (session.shots.length === 3) {
        const strip = photoStrip(session.shots);
        session = null; $('countdown').hidden = true; $('cancel-session').hidden = true; $('capture').disabled = false;
        savePhoto(strip, 'photobooth');
      } else session.nextAt = now + 3000;
    }
  }
  if (visionReady && !visionBusy && now - lastInferenceAt > 50) {
    visionBusy = true; lastInferenceAt = now; const current = worker;
    createImageBitmap(video).then(image => {
      if (worker !== current || !live) { image.close(); return; }
      current.postMessage({ type: 'frame', image, timestamp: now, face: mode === 'meme' && phase === 'studio', mode }, [image]);
    }).catch(() => { visionBusy = false; });
  }
}

document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => chooseMode(button.dataset.mode)));
$('start-camera').addEventListener('click', startCamera); $('stop-camera').addEventListener('click', () => stopCamera());
$('enter-studio').addEventListener('click', enterStudio);
$('manual-access').addEventListener('click', () => { manual = true; if (live) enterStudio(); else startCamera(); });
$('capture').addEventListener('click', capture); $('cancel-session').addEventListener('click', cancelSession);
$('retry-save').addEventListener('click', () => { if (pendingSave) savePhoto(pendingSave.canvas, pendingSave.kind); });
$('clear-paint').addEventListener('click', () => { rememberPaint(); paintCtx.clearRect(0, 0, paint.width, paint.height); lastPaint = null; draftShape = null; });
$('undo-paint').addEventListener('click', () => {
  if (!undoImage) return;
  paintCtx.clearRect(0, 0, paint.width, paint.height); paintCtx.putImageData(undoImage, 0, 0);
  undoImage = null; lastPaint = null; draftShape = null; $('undo-paint').disabled = true;
});
$('eraser').addEventListener('click', () => {
  erasing = !erasing; paintTool = 'brush'; draftShape = null;
  $('eraser').setAttribute('aria-pressed', String(erasing));
  document.querySelectorAll('[data-shape]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shape === 'brush')));
});
document.querySelectorAll('[data-shape]').forEach(button => button.addEventListener('click', () => {
  paintTool = button.dataset.shape; draftShape = null; erasing = false; $('eraser').setAttribute('aria-pressed', 'false');
  document.querySelectorAll('[data-shape]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  $('paint-hint').textContent = paintTool === 'brush' ? 'Cubit untuk menggambar. Lepas untuk berhenti.' : 'Cubit kedua tangan untuk ukuran. Lepas untuk menempelkan.';
}));
function toggleColor(open) { $('color-picker').hidden = !open; $('color-toggle').setAttribute('aria-expanded', String(open)); }
$('color-toggle').addEventListener('click', () => toggleColor($('color-picker').hidden));
$('color-done').addEventListener('click', () => { toggleColor(false); $('color-toggle').focus({ preventScroll: true }); });
$('color-hue').addEventListener('input', () => { hue = Number($('color-hue').value); updateColor(); });
$('paint-color').addEventListener('input', () => {
  const rgb = $('paint-color').value.match(/\w\w/g).map(value => parseInt(value, 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb), d = max - min;
  brightness = max; saturation = max ? d / max : 0;
  if (d) hue = ((max === rgb[0] ? (rgb[1] - rgb[2]) / d : max === rgb[1] ? 2 + (rgb[2] - rgb[0]) / d : 4 + (rgb[0] - rgb[1]) / d) * 60 + 360) % 360;
  $('color-hue').value = Math.round(hue); updateColor();
});
$('color-field').addEventListener('pointerdown', event => { event.currentTarget.setPointerCapture(event.pointerId); setSpatialControl(event.currentTarget, event.clientX, event.clientY); });
$('color-field').addEventListener('pointermove', event => { if (event.buttons) setSpatialControl(event.currentTarget, event.clientX, event.clientY); });
$('color-field').addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  saturation = clamp(saturation + (event.key === 'ArrowRight' ? 0.02 : event.key === 'ArrowLeft' ? -0.02 : 0), 0, 1);
  brightness = clamp(brightness + (event.key === 'ArrowUp' ? 0.02 : event.key === 'ArrowDown' ? -0.02 : 0), 0, 1); updateColor();
});
let shapeAnchor = null;
let keyboardPoint = { x: 0.5, y: 0.5 }, keyboardPen = false;
preview.addEventListener('keydown', event => {
  if (mode !== 'painting' || !live || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter','Escape'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  keyboardDrawing = true;
  const dx = event.key === 'ArrowRight' ? 0.02 : event.key === 'ArrowLeft' ? -0.02 : 0;
  const dy = event.key === 'ArrowDown' ? 0.02 : event.key === 'ArrowUp' ? -0.02 : 0;
  if (event.key === 'Escape') { keyboardPen = false; draftShape = null; lastPaint = null; return; }
  if (paintTool === 'brush') {
    if (event.key === ' ' || event.key === 'Enter') { keyboardPen = !keyboardPen; lastPaint = null; if (keyboardPen) rememberPaint(); }
    keyboardPoint = { x: clamp(keyboardPoint.x + dx, 0, 1), y: clamp(keyboardPoint.y + dy, 0, 1) };
    drawStroke(keyboardPen ? { x: keyboardPoint.x * paint.width, y: keyboardPoint.y * paint.height } : null);
    feedback(keyboardPen ? 'Pena turun. Panah menggambar; Spasi mengangkat pena.' : 'Pena terangkat.');
  } else {
    draftShape ??= { x: .3, y: .3, w: .4, h: .4 };
    if (event.key === 'Enter' || event.key === ' ') { rememberPaint(); drawShape(paintCtx, draftShape); draftShape = null; feedback('Bentuk ditempel.'); }
    else if (event.shiftKey) { draftShape.w = clamp(draftShape.w + dx, .03, 1 - draftShape.x); draftShape.h = clamp(draftShape.h + dy, .03, 1 - draftShape.y); }
    else { draftShape.x = clamp(draftShape.x + dx, 0, 1 - draftShape.w); draftShape.y = clamp(draftShape.y + dy, 0, 1 - draftShape.h); }
  }
});
preview.addEventListener('blur', () => { keyboardDrawing = false; keyboardPen = false; lastPaint = null; draftShape = null; });
preview.addEventListener('pointerdown', event => {
  if (mode !== 'painting' || !live || phase !== 'studio') return;
  keyboardDrawing = false;
  pointerDown = true; lastPaint = null; preview.setPointerCapture(event.pointerId); rememberPaint();
  const point = canvasPoint(event.clientX, event.clientY, preview.getBoundingClientRect(), preview.width, preview.height, 'cover');
  if (paintTool === 'brush') drawStroke(point); else shapeAnchor = point;
});
preview.addEventListener('pointermove', event => {
  if (!pointerDown) return;
  const point = canvasPoint(event.clientX, event.clientY, preview.getBoundingClientRect(), preview.width, preview.height, 'cover');
  if (paintTool === 'brush') drawStroke(point);
  else if (point && shapeAnchor) draftShape = { x: Math.min(point.x, shapeAnchor.x) / paint.width, y: Math.min(point.y, shapeAnchor.y) / paint.height,
    w: Math.abs(point.x - shapeAnchor.x) / paint.width, h: Math.abs(point.y - shapeAnchor.y) / paint.height };
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) preview.addEventListener(name, () => {
  if (name === 'pointerup' && draftShape) drawShape(paintCtx, draftShape);
  pointerDown = false; lastPaint = null; draftShape = null; shapeAnchor = null;
});
$('toggle-tools').addEventListener('click', () => {
  $('tool-panel').hidden = !$('tool-panel').hidden;
  $('toggle-tools').setAttribute('aria-expanded', String(!$('tool-panel').hidden));
});
$('gallery-toggle').addEventListener('click', openGallery);
$('gallery-close').addEventListener('click', () => $('saved-section').close());
$('gallery-prev').addEventListener('click', () => { galleryIndex--; showGalleryPhoto(); });
$('gallery-next').addEventListener('click', () => { galleryIndex++; showGalleryPhoto(); });
$('saved-section').addEventListener('close', () => { document.body.append($('gesture-cursor')); $('gallery-toggle').focus({ preventScroll: true }); });

document.addEventListener('keydown', event => {
  if ($('saved-section').open) return;
  if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.repeat) return;
  if (event.code === 'Space' && event.target.tagName === 'BUTTON') return;
  if (/^[1-4]$/.test(event.key)) chooseMode(['free', 'painting', 'photobooth', 'meme'][Number(event.key) - 1]);
  else if (event.key.toLowerCase() === 's' || event.code === 'Space') { event.preventDefault(); capture(); }
  else if (event.key.toLowerCase() === 'p' && photos.length) { event.preventDefault(); printPhoto(photos.at(-1)); }
  else if (event.key === 'Escape' && session) cancelSession();
});
window.addEventListener('beforeunload', event => {
  if (photos.length || session?.shots.length || undoImage || pendingSave) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && live) stopCamera('Kamera dijeda karena halaman tidak aktif. Aktifkan kembali untuk melanjutkan.'); });
requestAnimationFrame(render);

updateColor();
