import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceProfile } from '../../web/device-profile.js';

test('desktop keeps higher camera detail while compact or constrained devices reduce inference work', () => {
  const desktop = deviceProfile();
  assert.equal(desktop.video.width.ideal, 1280);
  assert.equal(desktop.inferenceInterval, 50);
  for (const options of [{ compact: true }, { cores: 2 }, { memory: 4 }]) {
    const light = deviceProfile(options);
    assert.ok(light.video.width.ideal < desktop.video.width.ideal);
    assert.ok(light.inferenceWidth < desktop.inferenceWidth);
    assert.ok(light.inferenceInterval > desktop.inferenceInterval);
  }
});
