export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function describeHand(points) {
  const palm = Math.max(distance(points[0], points[9]), 0.001);
  const extended = [distance(points[4], points[17]) > distance(points[3], points[17]),
    ...[[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, joint]) => distance(points[tip], points[0]) > distance(points[joint], points[0]))];
  const pinch = distance(points[4], points[8]) / palm;
  let pose = 'none';
  if (!extended.some(Boolean)) pose = 'fist';
  else if (pinch < 0.32) pose = 'pinch';
  else if (extended.filter(Boolean).length >= 4) pose = 'open';
  else if (extended[1] && extended[2] && !extended[3] && !extended[4]) pose = 'peace';
  else if (extended[0] && extended[1] && !extended[2] && !extended[4]) pose = points[8].y < points[5].y ? 'l_up' : 'l_down';
  else if (extended[1] && extended.filter(Boolean).length === 1) pose = 'point';
  return { points, pose, palm, pinch, gap: distance(points[8], points[12]) / palm,
    paint: { x: (points[4].x + points[8].x) / 2, y: (points[4].y + points[8].y) / 2 } };
}

export function automaticEffect(hands) {
  const pair = hands.slice(0, 2);
  if (pair.length === 2 && pair.every(hand => hand.pose.startsWith('l_'))) {
    const points = pair.flatMap(hand => [hand.points[4], hand.points[8], hand.points[5]]);
    const x = clamp(Math.min(...points.map(p => p.x)) - 0.025, 0, 0.999);
    const y = clamp(Math.min(...points.map(p => p.y)) - 0.025, 0, 0.999);
    const right = clamp(Math.max(...points.map(p => p.x)) + 0.025, x + 0.001, 1);
    const bottom = clamp(Math.max(...points.map(p => p.y)) + 0.025, y + 0.001, 1);
    return { name: pair.every(h => h.pose === 'l_up') ? 'blur' : pair.every(h => h.pose === 'l_down') ? 'flip' : 'mosaic',
      rect: { x, y, w: right - x, h: bottom - y } };
  }
  const peace = hands.find(hand => hand.pose === 'peace');
  return { name: peace ? 'blur' : 'none', radius: peace ? 4 + clamp(peace.gap, 0, 1.4) * 10 : 0 };
}

export function canvasPoint(clientX, clientY, rect, width, height) {
  const scale = Math.min(rect.width / width, rect.height / height);
  const x = (clientX - rect.left - (rect.width - width * scale) / 2) / scale;
  const y = (clientY - rect.top - (rect.height - height * scale) / 2) / scale;
  return x >= 0 && x <= width && y >= 0 && y <= height ? { x, y } : null;
}

export class MemeLatch {
  candidate = null; since = 0; showing = null;
  update(scores, now) {
    const threshold = name => name === 'tongue' ? 0.45 : 0.35;
    if (this.showing && (scores[this.showing] || 0) < threshold(this.showing) * 0.6) this.showing = null;
    const best = Object.entries(scores).filter(([name, score]) => score >= threshold(name)).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (best && best !== this.showing) {
      if (best !== this.candidate) { this.candidate = best; this.since = now; }
      if (now - this.since >= 180) { this.showing = best; this.candidate = null; }
    } else this.candidate = null;
    return this.showing;
  }
}
