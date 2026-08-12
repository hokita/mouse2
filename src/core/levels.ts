/**
 * Which step of a difficulty ladder a run is on after `elapsedMs`.
 *
 * The ladder advances in whole steps rather than sliding continuously: the
 * game is meant to visibly change gear every `stepMs`, which is something a
 * small child can feel ("it got faster!") in a way a smooth ramp never is.
 * The last step is held for the rest of the run.
 */
export function levelIndexAt(elapsedMs: number, stepMs: number, levelCount: number): number {
  if (levelCount <= 1 || stepMs <= 0) {
    return 0;
  }
  const step = Math.floor(Math.max(0, elapsedMs) / stepMs);
  return Math.min(levelCount - 1, step);
}
