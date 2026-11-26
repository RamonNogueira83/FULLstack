import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAYER_MODEL, PLAYER_SKINS } from '../src/game/playerAppearance.js';

test('remote avatar and authoritative hitboxes share the same world-space centers', () => {
  const cameraY = 1.65;
  const modelBaseY = cameraY - PLAYER_MODEL.eyeHeight;
  const renderedBodyY = modelBaseY + PLAYER_MODEL.bodyCenterY;
  const renderedHeadY = modelBaseY + PLAYER_MODEL.headCenterY;
  const bodyHitboxY = cameraY + PLAYER_MODEL.bodyCenterY - PLAYER_MODEL.eyeHeight;
  const headHitboxY = cameraY + PLAYER_MODEL.headCenterY - PLAYER_MODEL.eyeHeight;

  assert.ok(Math.abs(renderedBodyY - bodyHitboxY) < 1e-9);
  assert.ok(Math.abs(renderedHeadY - headHitboxY) < 1e-9);
  assert.ok(Math.abs(modelBaseY + 0.06) < 1e-9);
});

test('selectable original skins have unique identifiers', () => {
  const ids = PLAYER_SKINS.map((skin) => skin.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 3);
});
