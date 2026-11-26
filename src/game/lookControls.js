const MAX_LOOK_DELTA = 100;

export function clampLookDelta(delta) {
  if (!Number.isFinite(delta)) return 0;
  return Math.max(-MAX_LOOK_DELTA, Math.min(MAX_LOOK_DELTA, delta));
}
