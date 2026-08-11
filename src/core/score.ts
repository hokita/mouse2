export interface ScoreState {
  points: number;
}

export function createScore(): ScoreState {
  return { points: 0 };
}

export function addPoints(state: ScoreState, points: number): ScoreState {
  return { points: state.points + points };
}

export function getScoreValue(state: ScoreState): number {
  return state.points;
}
