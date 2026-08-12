export interface SpawnerState {
  minInterval: number;
  maxInterval: number;
  timer: number;
  nextInterval: number;
}

function randomInterval(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}

export function createSpawner(
  minInterval: number,
  maxInterval: number,
  random: () => number = Math.random
): SpawnerState {
  return {
    minInterval,
    maxInterval,
    timer: 0,
    nextInterval: randomInterval(minInterval, maxInterval, random),
  };
}

/**
 * Points a running spawner at a new interval range without losing the time it
 * has already banked.
 *
 * The interval it had already rolled is clamped into the new range rather than
 * left alone or re-rolled: left alone, a step up in difficulty would not be
 * felt until after the long wait that was rolled under the old, slower
 * settings — which is exactly the moment the change is supposed to be
 * noticeable.
 */
export function retuneSpawner(
  state: SpawnerState,
  minInterval: number,
  maxInterval: number
): SpawnerState {
  return {
    minInterval,
    maxInterval,
    timer: state.timer,
    nextInterval: Math.min(maxInterval, Math.max(minInterval, state.nextInterval)),
  };
}

export function tickSpawner(
  state: SpawnerState,
  dt: number,
  random: () => number = Math.random
): { state: SpawnerState; shouldSpawn: boolean } {
  const timer = state.timer + dt;
  if (timer >= state.nextInterval) {
    return {
      state: {
        ...state,
        timer: timer - state.nextInterval,
        nextInterval: randomInterval(state.minInterval, state.maxInterval, random),
      },
      shouldSpawn: true,
    };
  }
  return { state: { ...state, timer }, shouldSpawn: false };
}
