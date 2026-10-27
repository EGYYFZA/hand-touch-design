export function hand(pose = 'point', x = 0.5, y = 0.5) {
  const p = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  const put = (i, dx, dy) => p[i] = { x: x + dx, y: y + dy, z: 0 };
  put(0, 0, .18); put(1, -.04, .12); put(2, -.06, .1); put(3, -.07, .1); put(4, -.025, .13);
  for (const [base, dx] of [[5,-.055],[9,0],[13,.045],[17,.08]]) {
    put(base, dx, .02); put(base + 1, dx, -.06); put(base + 2, dx, .03); put(base + 3, dx, .08);
  }
  if (['point','peace','l_up','l_down','open'].includes(pose)) { put(7, -.055, -.14); put(8, -.055, -.22); }
  if (['peace','open'].includes(pose)) { put(11, 0, -.14); put(12, 0, -.22); }
  if (pose === 'open') { put(15, .045, -.13); put(16, .045, -.2); put(19, .08, -.1); put(20, .08, -.16); }
  if (['l_up','l_down','open'].includes(pose)) put(4, -.23, .03);
  if (pose === 'pinch') { put(4, -.23, .03); p[8] = { ...p[4] }; }
  if (pose === 'l_down') p.forEach(point => point.y = 2 * y - point.y);
  return p;
}

export async function fakeVision(page) {
  await page.addInitScript(() => {
    window.visionFixture = { landmarks: [], face: null, shapes: [] };
    window.Worker = class {
      postMessage(data) {
        if (data.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0);
        if (data.type === 'frame') {
          data.image.close();
          const f = window.visionFixture;
          const mirror = points => points.map(p => ({ ...p, x: 1 - p.x }));
          setTimeout(() => this.onmessage?.({ data: { type: 'result', landmarks: f.landmarks.map(mirror),
            face: f.face ? mirror(f.face) : null, shapes: f.shapes, mode: data.mode, timestamp: data.timestamp - (window.fixtureAge || 0) } }), 0);
        }
      }
      terminate() { this.onmessage = null; }
    };
  });
}

export async function pose(page, landmarks, face = null, shapes = []) {
  await page.evaluate(fixture => window.visionFixture = fixture, { landmarks, face, shapes });
}

export async function pointAt(page, selector) {
  const rect = await page.locator(selector).first().boundingBox();
  const viewport = page.viewportSize();
  const x = .12 + (rect.x + rect.width / 2) / (viewport.width - 1) * .76;
  const y = .1 + (rect.y + rect.height / 2) / (viewport.height - 1) * .7;
  const p = hand('point'); const dx = x - p[8].x, dy = y - p[8].y;
  await pose(page, [p.map(v => ({ ...v, x: v.x + dx, y: v.y + dy }))]);
}
