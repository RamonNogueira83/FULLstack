import assert from 'node:assert/strict';
import test from 'node:test';
import {
  containerLayout,
  coverLayout,
  crateLayout,
  pillarLayout,
  wallLayout,
} from '../src/game/mapLayout.js';
import { createArenaPhysics } from '../src/physics/arenaPhysics.js';

const map = { crateLayout, pillarLayout, containerLayout, coverLayout, wallLayout };

test('Rapier keeps the player on the floor and blocks movement at crates', async () => {
  const physics = await createArenaPhysics({
    ...map,
    spawn: { x: -7, y: 0.84, z: 10 },
  });

  try {
    let position;
    for (let frame = 0; frame < 5; frame += 1) {
      position = physics.move({ x: 0, y: -0.02, z: 0 });
    }

    assert.equal(position.grounded, true);
    assert.ok(Math.abs(position.y - 1.65) < 0.05);

    let verticalVelocity = 6.2;
    let jumpHeight = position.y;
    for (let frame = 0; frame < 90; frame += 1) {
      verticalVelocity -= 16 / 60;
      position = physics.move({ x: 0, y: verticalVelocity / 60, z: 0 });
      jumpHeight = Math.max(jumpHeight, position.y);
      if (position.grounded && verticalVelocity < 0) {
        verticalVelocity = 0;
        break;
      }
    }

    assert.ok(jumpHeight > 2.7, `Expected a jump above 2.7m, reached ${jumpHeight}`);
    assert.equal(position.grounded, true);

    for (let frame = 0; frame < 80; frame += 1) {
      position = physics.move({ x: 0, y: 0, z: -0.1 });
    }

    assert.ok(position.z > 6.5, `Expected to stop before the crate, got z=${position.z}`);
    assert.ok(position.z < 8, `Expected forward movement to stop at the crate, got z=${position.z}`);
  } finally {
    physics.dispose();
  }
});

test('Rapier blocks movement at the new industrial containers', async () => {
  const physics = await createArenaPhysics({
    crateLayout: [],
    pillarLayout: [],
    containerLayout: [containerLayout[0]],
    coverLayout: [],
    wallLayout: [],
    spawn: { x: -7, y: 0.84, z: -5.2 },
  });

  try {
    let position;
    for (let frame = 0; frame < 5; frame += 1) {
      position = physics.move({ x: 0, y: -0.02, z: 0 });
    }

    for (let frame = 0; frame < 60; frame += 1) {
      position = physics.move({ x: -0.1, y: 0, z: 0 });
    }

    assert.ok(position.x > -10, `Expected to stop before the container, got x=${position.x}`);
    assert.ok(position.x < -8, `Expected to approach the container, got x=${position.x}`);
  } finally {
    physics.dispose();
  }
});
