import test from 'node:test';
import assert from 'node:assert/strict';
import { DwellSelector, screenPoint, shapeBounds, hsvToHex, expressionScores, describeHand, smoothPoint, canvasPoint } from '../../web/gestures.js';
import { hand } from '../browser/fixtures.mjs';

test('dwell fires once, resets for a new target and cannot count missing frames', () => {
  const dwell = new DwellSelector();
  for (let t = 0; t < 800; t += 100) assert.equal(dwell.update('painting', t), null);
  assert.equal(dwell.update('painting', 800), 'painting');
  assert.equal(dwell.update('painting', 900), null);
  dwell.update(null, 1000);
  for (let t = 1100; t < 1900; t += 100) assert.equal(dwell.update('painting', t), null);
  assert.equal(dwell.update('painting', 1900), 'painting');
  assert.equal(dwell.update('meme', 2000), null);
  assert.equal(dwell.update('meme', 3000), null);
  assert.equal(dwell.progress, 0);
});

test('point mapping reaches all screen edges without leaving the viewport', () => {
  assert.deepEqual(screenPoint({ x: 0, y: 0 }, 1440, 900), { x: 0, y: 0 });
  assert.deepEqual(screenPoint({ x: 1, y: 1 }, 1440, 900), { x: 1439, y: 899 });
});

test('fullscreen cover maps pointer to the cropped camera without stretching', () => {
  const rect={left:0,top:0,width:400,height:300};
  const left=canvasPoint(0,150,rect,1280,720,'cover');
  assert.ok(Math.abs(left.x-160)<0.001); assert.equal(left.y,360);
  assert.deepEqual(canvasPoint(200,150,rect,1280,720,'cover'),{x:640,y:360});
});

test('smoothing is independent of refresh rate and never overshoots', () => {
  const target={x:100,y:200};
  const one=smoothPoint({x:0,y:0},target,32);
  const two=smoothPoint(smoothPoint({x:0,y:0},target,16),target,16);
  assert.ok(Math.abs(one.x-two.x)<1e-9);
  assert.ok(one.x>0 && one.x<100); assert.deepEqual(smoothPoint(null,target,16),target);
});

test('classification is mirrored consistently and only two pinches create shape bounds', () => {
  for (const pose of ['point','peace','open','fist','l_up','l_down','pinch']) {
    assert.equal(describeHand(hand(pose)).pose, pose);
    assert.equal(describeHand(hand(pose).map(p => ({ ...p, x: 1 - p.x }))).pose, pose);
  }
  const a = describeHand(hand('pinch', .4, .3)), b = describeHand(hand('pinch', .8, .7));
  assert.ok(shapeBounds([a,b]).w > .39);
  assert.deepEqual(shapeBounds([a,b]), shapeBounds([b,a]));
  assert.equal(shapeBounds([a]), null);
  assert.equal(shapeBounds([describeHand(hand('fist')),b]), null);
});

test('HSV picker covers primaries, white, black and gray', () => {
  assert.equal(hsvToHex(0,1,1), '#ff0000'); assert.equal(hsvToHex(120,1,1), '#00ff00');
  assert.equal(hsvToHex(240,1,1), '#0000ff'); assert.equal(hsvToHex(198,0,1), '#ffffff');
  assert.equal(hsvToHex(80,1,0), '#000000'); assert.equal(hsvToHex(80,0,.5), '#808080');
});

function faceFixture() {
  const face = Array.from({ length: 478 }, () => ({ x: .5, y: .3 }));
  face[13] = { x: .5, y: .35 }; face[14] = { x: .5, y: .37 };
  face[234] = { x: .4, y: .3 }; face[454] = { x: .6, y: .3 }; face[152] = { x: .5, y: .42 };
  return face;
}

test('meme conditions need the requested expression AND the matching hand/body region', () => {
  const face = faceFixture(), smile = { mouthSmileLeft: .8 };
  let point = describeHand(hand('point'));
  assert.equal(expressionScores([point], face, smile).idea, .8);
  assert.equal(expressionScores([point], face, {}).idea, 0);
  point.points[8] = { x: .5, y: .36 };
  const clingy = expressionScores([point], face, smile);
  assert.equal(clingy.clingy, .8); assert.equal(clingy.idea, 0);
  assert.equal(expressionScores([describeHand(hand('open'))], face, smile).clingy, 0);
  assert.equal(expressionScores([], face, {}, 1).tongue, 0);
  assert.equal(expressionScores([], face, smile, .9).tongue, .9);
  const surprise = { jawOpen: .8, eyeWideLeft: .7 };
  assert.ok(expressionScores([describeHand(hand('open', .46, .55)), describeHand(hand('open', .54, .55))], face, surprise).shock > .8);
  assert.equal(expressionScores([describeHand(hand('open', .1, .8)), describeHand(hand('open', .9, .8))], face, surprise).shock, 0);
  assert.equal(expressionScores([describeHand(hand('open', .46, .55)), describeHand(hand('open', .54, .55))], face, { jawOpen: .8 }).shock, 0);
  assert.deepEqual(expressionScores([], null, smile), {});
});
