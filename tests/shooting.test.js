import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeReload,
  createRifleState,
  fireRound,
  MAGAZINE_SIZE,
  RELOAD_DURATION,
  startReload,
} from '../src/game/shooting.js';

test('rifle fires at its rate limit and consumes magazine rounds', () => {
  const state = createRifleState();

  assert.equal(fireRound(state, 1), 'fired');
  assert.equal(state.magazine, MAGAZINE_SIZE - 1);
  assert.equal(fireRound(state, 1.05), 'cooldown');
  assert.equal(state.magazine, MAGAZINE_SIZE - 1);
  assert.equal(fireRound(state, 1.13), 'fired');
  assert.equal(state.magazine, MAGAZINE_SIZE - 2);
});

test('rifle reloads from reserve and rejects reload with a full magazine', () => {
  const state = createRifleState();

  assert.equal(startReload(state, 0), false);
  assert.equal(fireRound(state, 1), 'fired');
  assert.equal(startReload(state, 1), true);
  assert.equal(fireRound(state, 1.2), 'reloading');
  assert.equal(completeReload(state, 1 + RELOAD_DURATION - 0.01), false);
  assert.equal(completeReload(state, 1 + RELOAD_DURATION), true);
  assert.equal(state.magazine, MAGAZINE_SIZE);
  assert.equal(state.reserve, 89);
});

test('last reload uses only available reserve ammo', () => {
  const state = createRifleState();
  state.magazine = 5;
  state.reserve = 3;

  assert.equal(startReload(state, 0), true);
  assert.equal(completeReload(state, RELOAD_DURATION), true);
  assert.equal(state.magazine, 8);
  assert.equal(state.reserve, 0);
  assert.equal(startReload(state, RELOAD_DURATION), false);
});
