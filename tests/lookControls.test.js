import assert from 'node:assert/strict';
import test from 'node:test';
import { clampLookDelta } from '../src/game/lookControls.js';

test('look input ignores invalid deltas and limits extreme mouse events', () => {
  assert.equal(clampLookDelta(Number.NaN), 0);
  assert.equal(clampLookDelta(Number.POSITIVE_INFINITY), 0);
  assert.equal(clampLookDelta(45), 45);
  assert.equal(clampLookDelta(1000), 100);
  assert.equal(clampLookDelta(-1000), -100);
});
