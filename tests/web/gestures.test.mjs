import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticEffect, canvasPoint, MemeLatch, describeHand } from '../../web/gestures.js';

test('letterboxed pointer coordinates preserve the image aspect ratio', () => {
  const rect = { left: 10, top: 20, width: 400, height: 300 };
  assert.equal(canvasPoint(100, 30, rect, 1280, 720), null);
  assert.deepEqual(canvasPoint(210, 170, rect, 1280, 720), { x: 640, y: 360 });
});
test('meme candidates must each complete their own hold time', () => {
  const latch = new MemeLatch();
  assert.equal(latch.update({ idea: 0.8 }, 0), null);
  assert.equal(latch.update({ shock: 0.8 }, 200), null);
  assert.equal(latch.update({ shock: 0.8 }, 400), 'shock');
});
test('meme release uses the lower confidence threshold', () => {
  const latch = new MemeLatch();
  latch.update({ tongue: 0.6 }, 0); latch.update({ tongue: 0.6 }, 200);
  assert.equal(latch.update({ tongue: 0.4 }, 300), 'tongue');
  assert.equal(latch.update({ tongue: 0.2 }, 400), null);
});
test('no hands produce no effect and mirrored distances still classify a fist', () => {
  assert.equal(automaticEffect([]).name, 'none');
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  points[0] = { x: 0.5, y: 0.9 };
  assert.equal(describeHand(points).pose, 'fist');
});
test('two L poses select different area effects', () => {
  const points = Array.from({ length: 21 }, (_, i) => ({ x: 0.2 + i / 100, y: 0.3 + i / 100 }));
  assert.equal(automaticEffect([{ pose: 'l_up', points }, { pose: 'l_up', points }]).name, 'blur');
  assert.equal(automaticEffect([{ pose: 'l_up', points }, { pose: 'l_down', points }]).name, 'mosaic');
  assert.equal(automaticEffect([{ pose: 'l_down', points }, { pose: 'l_down', points }]).name, 'flip');
});
