import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  getMuzzleOffset,
  MUZZLE_LOCAL_POSITION,
  createRifleViewModel,
} from '../src/game/weapon.js';

test('muzzle flash origin is positioned at the muzzle-device exit', () => {
  const camera = new THREE.PerspectiveCamera();
  const weapon = createRifleViewModel(camera);
  const muzzleDevice = weapon.getObjectByName('rifle-muzzle-device');
  const muzzle = weapon.userData.muzzle;
  assert.ok(muzzleDevice);

  weapon.updateMatrixWorld(true);
  const muzzleExit = muzzleDevice.localToWorld(new THREE.Vector3(0, -0.04, 0));
  const muzzlePosition = muzzle.getWorldPosition(new THREE.Vector3());
  const offset = muzzleExit.distanceTo(muzzlePosition);

  assert.ok(offset < 0.001, `flash origin is ${offset} units behind the muzzle exit`);
  assert.equal(weapon.userData.muzzleFlash.visible, false);
  assert.equal(weapon.userData.muzzleFlash.children.length, 3);
  assert.deepEqual(MUZZLE_LOCAL_POSITION, { x: 0, y: 0.02, z: -1.12 });
});

test('server muzzle offset matches the rendered weapon at arbitrary view angles', () => {
  const yaw = 0.73;
  const pitch = -0.24;
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, yaw, 0);
  const weapon = createRifleViewModel(camera);
  camera.updateMatrixWorld(true);

  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const muzzlePosition = weapon.userData.muzzle.getWorldPosition(new THREE.Vector3());
  const renderedOffset = muzzlePosition.sub(cameraPosition);

  assert.ok(
    renderedOffset.distanceTo(getMuzzleOffset(yaw, pitch)) < 0.0001,
    'server-calculated muzzle should match the rendered weapon muzzle',
  );
});
