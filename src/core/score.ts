export interface ScoreState {
  points: number;
}

export function createScore(): ScoreState {
  return { points: 0 };
}

/**
 * `points` may be negative — a penalty is just a negative award.
 *
 * `minimum` is the floor the total is held at. It defaults to no floor at all
 * so the games that only ever add are unaffected; Fish Catch passes 0, because
 * a penalty that pushes a small child's score below zero stops reading as
 * "that one didn't count" and starts reading as "you are losing".
 */
export function addPoints(
  state: ScoreState,
  points: number,
  minimum: number = Number.NEGATIVE_INFINITY
): ScoreState {
  return { points: Math.max(minimum, state.points + points) };
}

export function getScoreValue(state: ScoreState): number {
  return state.points;
}
