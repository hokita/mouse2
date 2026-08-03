export interface ScoreState {
  elapsedMs: number;
}

export function createScore(): ScoreState {
  return { elapsedMs: 0 };
}

export function tickScore(state: ScoreState, dt: number): ScoreState {
  return { elapsedMs: state.elapsedMs + dt };
}

export function getScoreValue(state: ScoreState): number {
  return Math.floor(state.elapsedMs / 100);
}
