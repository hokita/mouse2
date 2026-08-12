// The spawn interval tightens as a run goes on.
//
// Both ends are set from the resulting enemy *population*, not from the
// interval in isolation: an enemy lives (HEIGHT + 2 * height) / fall speed
// seconds on screen, so population is roughly lifetime / interval. At the
// old 60px/s fall speed a 400-700ms floor meant ~33 enemies alive at once,
// covering nearly 40% of the screen — a wall rather than a difficulty. The
// faster fall (90px/s) cuts each enemy's life to ~12.2s, which is what makes
// these intervals sane:
//
//   opening 1100-1700ms -> ~8.7 enemies alive, but falling 50% faster than
//                          before, so the run is harder from the first second
//   floor    700-1000ms -> ~14.4 alive, dense but with gaps a child can read
//
// The opening deliberately does NOT match the old rate: a run that a small
// child ends in 30-60s has to be harder immediately, not only in a minute's
// time that they will never see.
const START_MIN_MS = 1100;
const START_MAX_MS = 1700;
const FLOOR_MIN_MS = 700;
const FLOOR_MAX_MS = 1000;
const RAMP_MS = 60_000;

export interface SpawnRange {
  min: number;
  max: number;
}

/** Enemy spawn interval range at `elapsedMs` into the run. */
export function spawnRange(elapsedMs: number): SpawnRange {
  const t = Math.min(1, Math.max(0, elapsedMs / RAMP_MS));
  return {
    min: START_MIN_MS + (FLOOR_MIN_MS - START_MIN_MS) * t,
    max: START_MAX_MS + (FLOOR_MAX_MS - START_MAX_MS) * t,
  };
}
