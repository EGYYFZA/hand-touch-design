// Reuse local renders from the landing scene; camera pixels are drawn last.
const artwork = {};
let loading = null;
export function preparePhotoStrip() {
  return loading ??= Promise.all(['mascot', 'mint', 'star', 'ticket', 'ribbon'].map(name => {
    if (artwork[name]) return true;
    return new Promise(resolve => {
      const image = new Image(), timeout = setTimeout(() => resolve(false), 3500);
      image.onload = () => { clearTimeout(timeout); artwork[name] = image; resolve(true); };
      image.onerror = () => { clearTimeout(timeout); resolve(false); };
      image.src = new URL(`home-${name}.webp`, import.meta.url).href;
    });
  })).then(results => results.every(Boolean)).finally(() => { loading = null; });
}

function palette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(['white', 'green', 'mint', 'lime', 'purple', 'lilac', 'pink', 'yellow']
    .map(key => [key, style.getPropertyValue(`--festival-${key}`).trim()]));
}

export function createPhotoStrip(shots) {
  const strip = document.createElement('canvas'), w = shots[0].width, h = shots[0].height;
  const border = Math.round(w * .09), gap = Math.round(w * .06), header = Math.round(w * .30), footer = Math.round(w * .28);
  strip.width = w + border * 2; strip.height = header + h * 3 + gap * 2 + footer;
  const c = strip.getContext('2d'), p = palette(), W = strip.width, H = strip.height;
  const accents = [p.mint, p.lilac, p.pink];
  function box(x, y, width, height, radius, fill) {
    c.beginPath(); c.roundRect(x, y, width, height, radius); c.fillStyle = fill; c.fill();
  }
  function sticker(name, x, y, size, angle = 0) {
    const image = artwork[name];
    if (!image) return;
    c.save(); c.translate(x, y); c.rotate(angle);
    c.drawImage(image, -size / 2, -size * image.naturalHeight / image.naturalWidth / 2, size, size * image.naturalHeight / image.naturalWidth);
    c.restore();
  }
  c.fillStyle = p.white; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#0d67312b'; c.lineWidth = Math.max(1, w * .0015);
  c.beginPath(); c.roundRect(w * .015, w * .015, W - w * .03, H - w * .03, w * .035); c.stroke();

  // Rounded paper rails and tiny confetti make the margins a little playground.
  box(w * .025, w * .20, w * .025, H - w * .40, w * .012, '#edf9ee');
  box(W - w * .050, w * .20, w * .025, H - w * .40, w * .012, '#f1e8ff');
  for (let i = 0; i < 9; i++) {
    c.fillStyle = [p.mint, p.lilac, p.yellow][i % 3];
    c.beginPath(); c.arc(w * (.13 + i * .11), w * .045, w * .004, 0, Math.PI * 2); c.fill();
  }

  sticker('mascot', w * .21, header * .49, w * .38, -.13);
  box(w * .39, header * .20, w * .53, w * .052, w * .026, '#e7f8e9');
  c.fillStyle = p.green; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `650 ${Math.max(6, Math.round(w * .017))}px "Mona Sans", sans-serif`;
  c.fillText('PHOTOBOOTH / 03 MOMENTS', w * .655, header * .20 + w * .026);
  c.textAlign = 'left'; c.font = `750 ${Math.round(w * .067)}px "Mona Sans", sans-serif`;
  c.fillText('EGZ', w * .395, header * .59);
  const brandWidth = c.measureText('EGZ').width;
  c.font = `500 ${Math.round(w * .050)}px "Mona Sans", sans-serif`;
  c.fillText('studio', w * .408 + brandWidth, header * .60);
  sticker('star', W - w * .105, header * .27, w * .23, .12);
  sticker('ticket', w * .72, header * .85, w * .20, -.12);

  shots.forEach((shot, i) => {
    const y = header + i * (h + gap), pad = w * .011;
    c.save(); c.shadowColor = '#163a2b24'; c.shadowBlur = w * .018; c.shadowOffsetY = w * .008;
    box(border - pad, y - pad, w + pad * 2, h + pad * 2, w * .018, accents[i]); c.restore();
    const x = border * .44, cy = y + Math.min(h * .18, w * .09), radius = border * .30;
    const bubble = c.createRadialGradient(x - radius * .3, cy - radius * .4, radius * .05, x, cy, radius);
    bubble.addColorStop(0, p.white); bubble.addColorStop(.55, accents[i]); bubble.addColorStop(1, [p.green, p.purple, '#a52379'][i]);
    c.fillStyle = bubble; c.beginPath(); c.arc(x, cy, radius, 0, Math.PI * 2); c.fill();
    c.fillStyle = p.green; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${Math.max(7, Math.round(w * .021))}px "Mona Sans", sans-serif`;
    c.fillText(String(i + 1).padStart(2, '0'), x, cy);
    sticker(['star', 'ribbon', 'mint'][i], W - border * .50, y + h * .62, border * 1.20, [.2, -.3, .12][i]);
    if (i < 2) {
      const sy = y + h + gap / 2;
      c.save(); c.setLineDash([w * .003, w * .012]); c.strokeStyle = '#0d673138'; c.lineWidth = Math.max(1, w * .0015);
      c.beginPath(); c.moveTo(w * .18, sy); c.lineTo(W - w * .18, sy); c.stroke(); c.restore();
      sticker(i ? 'ticket' : 'star', i ? W * .68 : W * .35, sy, w * .06, i ? -.12 : .15);
    }
  });

  const bottom = H - footer;
  sticker('ribbon', w * .15, bottom + footer * .56, w * .30, -.3);
  sticker('star', W - w * .17, bottom + footer * .56, w * .24, .18);
  sticker('ticket', W * .50, bottom + w * .19, w * .35, -.08);
  sticker('mascot', W * .50, bottom + w * .11, w * .29, .10);
  // No clipping, filters, stickers or shadows may modify the captured rectangles.
  shots.forEach((shot, i) => c.drawImage(shot, border, header + i * (h + gap), w, h));
  return strip;
}
