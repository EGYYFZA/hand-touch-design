// The exported frame reads the same palette as the UI; no remote image assets.
function palette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(['white', 'ink', 'green', 'mint', 'lime', 'purple', 'lilac', 'pink', 'yellow']
    .map(key => [key, style.getPropertyValue(`--festival-${key}`).trim()]));
}

function star(context, x, y, radius, color, points = 4) {
  context.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = i * Math.PI / points - Math.PI / 2, r = i % 2 ? radius * .43 : radius;
    context[i ? 'lineTo' : 'moveTo'](x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  context.closePath(); context.fillStyle = color; context.fill();
}

export function createPhotoStrip(shots) {
  const strip = document.createElement('canvas'), w = shots[0].width, h = shots[0].height;
  const border = Math.round(w * .055), gap = Math.round(w * .025), header = Math.round(w * .13), footer = Math.round(w * .12);
  strip.width = w + border * 2; strip.height = header + h * 3 + gap * 2 + footer;
  const c = strip.getContext('2d'), p = palette();
  c.fillStyle = p.white; c.fillRect(0, 0, strip.width, strip.height);
  c.strokeStyle = p.green; c.lineWidth = Math.max(1, w * .0015);
  c.strokeRect(border * .18, border * .18, strip.width - border * .36, strip.height - border * .36);

  // A bright ticket header, with an original EGZ spark rather than event logos.
  c.fillStyle = p.lime; c.fillRect(border, header * .25, w * .12, w * .047);
  c.fillStyle = p.ink; c.font = `750 ${Math.round(w * .029)}px "Mona Sans", sans-serif`;
  c.fillText('EGZ', border + w * .022, header * .25 + w * .035);
  c.font = `650 ${Math.round(w * .043)}px "Mona Sans", sans-serif`;
  c.fillText('GOOD TIMES.', border + w * .15, header * .25 + w * .036);
  c.fillStyle = p.green; c.font = `500 ${Math.max(7, Math.round(w * .014))}px monospace`;
  c.fillText('GESTURE STUDIO / THREE LITTLE MOMENTS', border, header * .85);
  star(c, strip.width - border - w * .045, header * .44, w * .034, p.lilac, 6);
  star(c, strip.width - border - w * .095, header * .72, w * .012, p.green);

  const accents = [p.green, p.purple, p.pink];
  shots.forEach((shot, i) => {
    const y = header + i * (h + gap);
    // Decoration stays in the margins; the complete captured image is preserved.
    c.drawImage(shot, border, y, w, h);
    c.strokeStyle = accents[i]; c.lineWidth = Math.max(1, w * .002);
    c.strokeRect(border - c.lineWidth, y - c.lineWidth, w + c.lineWidth * 2, h + c.lineWidth * 2);
    const bx = border * .72, by = y + Math.min(h * .14, w * .05);
    c.save(); c.translate(bx, by); c.rotate(-Math.PI / 2);
    c.fillStyle = p.green; c.font = `600 ${Math.max(7, Math.round(w * .016))}px monospace`; c.fillText(`0${i + 1}`, 0, 0); c.restore();
    star(c, strip.width - border * .5, y + h * .68, border * .24, [p.lime, p.lilac, p.yellow][i]);
    c.save(); c.translate(border * .5, y + h * .72); c.rotate(i % 2 ? -.4 : .4); c.fillStyle = [p.pink, p.mint, p.lilac][i]; c.fillRect(-border * .12, -border * .3, border * .24, border * .6); c.restore();
  });

  const bottom = strip.height - footer;
  c.fillStyle = p.ink; c.font = `600 ${Math.round(w * .023)}px "Mona Sans", sans-serif`;
  c.fillText('A LITTLE MORE YOU.', border, bottom + footer * .48);
  [p.mint, p.lilac, p.pink, p.yellow, p.lime].forEach((color, i) => {
    c.fillStyle = color; c.fillRect(border + i * w * .064, bottom + footer * .68, w * .056, Math.max(3, w * .008));
  });
  const sx = strip.width - border - w * .042, sy = bottom + footer * .49, r = w * .038;
  star(c, sx, sy, r, p.lime, 6);
  c.fillStyle = p.green; c.beginPath(); c.arc(sx - r * .2, sy - r * .1, r * .07, 0, Math.PI * 2); c.arc(sx + r * .2, sy - r * .1, r * .07, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.strokeStyle = p.green; c.lineWidth = Math.max(1, r * .07); c.arc(sx, sy + r * .04, r * .23, .1, Math.PI - .1); c.stroke();
  return strip;
}
