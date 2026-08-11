export interface SpeedRamp {
  /** Speed in px/s at the start of a run. */
  base: number;
  /** Speed in px/s the ramp tops out at. */
  max: number;
  /** How long, in ms, the ramp takes to go from `base` to `max`. */
  rampMs: number;
}

// Linear ramp from `base` to `max` over `rampMs`, flat afterwards. Returning
// the speed as a pure function of elapsed time (rather than accumulating it
// frame by frame) keeps it independent of frame rate and of any per-frame
// delta clamping the caller applies.
export function speedAt(elapsedMs: number, ramp: SpeedRamp): number {
  if (ramp.rampMs <= 0) {
    return ramp.max;
  }
  const progress = Math.min(1, Math.max(0, elapsedMs / ramp.rampMs));
  return ramp.base + (ramp.max - ramp.base) * progress;
}
