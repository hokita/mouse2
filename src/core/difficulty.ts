// The spawn interval tightens as a run goes on: every run opens at a rate a
// small child can read, and earns its difficulty from time survived rather
// than from starting hard.

const START_MIN_MS = 1500;
const START_MAX_MS = 2500;
const FLOOR_MIN_MS = 400;
const FLOOR_MAX_MS = 700;
const RAMP_MS = 90_000;

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
