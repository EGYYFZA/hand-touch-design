import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticEffect, canvasPoint, MemeLatch, describeHand, paintAction } from '../../web/gestures.js';
import { hand } from '../browser/fixtures.mjs';

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
  const points = hand('l_up', 0.5, 0.5);
  assert.equal(automaticEffect([{ pose: 'l_up', points }, { pose: 'l_up', points }]).name, 'blur');
  assert.equal(automaticEffect([{ pose: 'l_up', points }, { pose: 'l_down', points }]).name, 'mosaic');
  assert.equal(automaticEffect([{ pose: 'l_down', points }, { pose: 'l_down', points }]).name, 'flip');
});

test('rotated L frame follows fingertips as a polygon, independent of hand order', () => {
  const rotate = p => { const x = p.x - 0.5, y = p.y - 0.5, a = Math.PI / 7; return { x: 0.5 + x * Math.cos(a) - y * Math.sin(a), y: 0.5 + x * Math.sin(a) + y * Math.cos(a) }; };
  const pair = [hand('l_up', 0.35, 0.5), hand('l_up', 0.8, 0.5)].map(points => ({ points: points.map(rotate), pose: 'l_up' }));
  const effect = automaticEffect(pair);
  assert.ok(effect.polygon.length >= 3);
  assert.deepEqual(effect, automaticEffect([...pair].reverse()));
  assert.ok(effect.polygon.some(p => p.x > effect.rect.x + 0.001 && p.x < effect.rect.x + effect.rect.w - 0.001));
  const before = JSON.stringify(effect.polygon);
  pair[0].points[4].x -= 0.04;
  assert.notEqual(JSON.stringify(automaticEffect(pair).polygon), before);
  const flat = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  assert.equal(automaticEffect([{ pose: 'l_up', points: flat }, { pose: 'l_down', points: flat }]).name, 'none');
});

test('paint uses contact pinch to draw and open or relaxed hands to erase', () => {
  const closedPinch = hand('fist'); closedPinch[4] = { x: .445, y: .58 }; closedPinch[8] = { ...closedPinch[4] };
  assert.equal(paintAction(describeHand(closedPinch)).operation, 'draw');
  for (const pose of ['open', 'fist']) assert.equal(paintAction(describeHand(hand(pose))).operation, 'erase', pose);
  for (const pose of ['point', 'peace', 'l_up']) assert.equal(paintAction(describeHand(hand(pose))), null, pose);
  assert.equal(paintAction(null), null);
  const open = hand('open');
  for (const i of [12, 16, 20]) open[i].x = open[8].x + (i - 8) * .0001;
  assert.equal(paintAction(describeHand(open)).operation, 'erase');
});

test('pose metrics preserve pixel geometry across camera aspect ratios', () => {
  const points = hand('pinch');
  const one = describeHand(points, 1);
  const wide = describeHand(points.map(p => ({ ...p, x: p.x / (16 / 9) })), 16 / 9);
  assert.equal(wide.pose, one.pose);
  assert.ok(Math.abs(wide.pinch - one.pinch) < 1e-8);
});
