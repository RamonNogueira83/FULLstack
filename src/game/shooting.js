export const MAGAZINE_SIZE = 30;
export const RELOAD_DURATION = 1.25;
export const SHOT_INTERVAL = 0.12;

export function createRifleState() {
  return {
    magazine: MAGAZINE_SIZE,
    reserve: 90,
    reloadingUntil: 0,
    lastShotAt: -Infinity,
  };
}

export function fireRound(state, now) {
  if (state.reloadingUntil > now) {
    return 'reloading';
  }
  if (state.magazine === 0) {
    return 'empty';
  }
  if (now - state.lastShotAt < SHOT_INTERVAL) {
    return 'cooldown';
  }

  state.magazine -= 1;
  state.lastShotAt = now;
  return 'fired';
}

export function startReload(state, now) {
  if (
    state.reloadingUntil > now
    || state.magazine === MAGAZINE_SIZE
    || state.reserve === 0
  ) {
    return false;
  }

  state.reloadingUntil = now + RELOAD_DURATION;
  return true;
}

export function completeReload(state, now) {
  if (state.reloadingUntil === 0 || state.reloadingUntil > now) {
    return false;
  }

  const needed = MAGAZINE_SIZE - state.magazine;
  const loaded = Math.min(needed, state.reserve);
  state.magazine += loaded;
  state.reserve -= loaded;
  state.reloadingUntil = 0;
  return true;
}
