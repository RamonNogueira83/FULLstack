import assert from 'node:assert/strict';
import test from 'node:test';
import { getMovementInput, rotateMovement } from '../src/game/movement.js';

function movementFor(key, yaw = 0) {
  const input = getMovementInput(new Set([key]));
  return rotateMovement(input, yaw, 1);
}

test('W moves forward, S backward, A left, and D right', () => {
  assert.deepEqual(movementFor('KeyW'), { x: 0, z: -1 });
  assert.deepEqual(movementFor('KeyS'), { x: 0, z: 1 });
  assert.deepEqual(movementFor('KeyA'), { x: -1, z: 0 });
  assert.deepEqual(movementFor('KeyD'), { x: 1, z: 0 });
});

test('movement follows the camera yaw', () => {
  const forward = movementFor('KeyW', Math.PI / 2);
  const right = movementFor('KeyD', Math.PI / 2);

  assert.ok(Math.abs(forward.x + 1) < 1e-10);
  assert.ok(Math.abs(forward.z) < 1e-10);
  assert.ok(Math.abs(right.x) < 1e-10);
  assert.ok(Math.abs(right.z + 1) < 1e-10);
});

test('diagonal movement is normalized', () => {
  const input = getMovementInput(new Set(['KeyW', 'KeyD']));
  assert.ok(Math.abs(Math.hypot(input.x, input.z) - 1) < 1e-10);
});
