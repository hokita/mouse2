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
