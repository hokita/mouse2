export interface CountdownState {
  remainingMs: number;
}

export function createCountdown(durationMs: number): CountdownState {
  return { remainingMs: durationMs };
}

/** Never runs past zero, so a big frame delta can't leave a negative clock. */
export function tickCountdown(state: CountdownState, dt: number): CountdownState {
  return { remainingMs: Math.max(0, state.remainingMs - dt) };
}

// Rounded up, so the readout only shows 0 once the run is genuinely over —
// a clock that sits on 0 for a whole second while the game is still running
// reads as a bug to the player.
export function secondsLeft(state: CountdownState): number {
  return Math.ceil(state.remainingMs / 1000);
}

export function isFinished(state: CountdownState): boolean {
  return state.remainingMs <= 0;
}

/**
 * How long the run has been going. Derived from what is left rather than
 * accumulated separately, so the difficulty ramp and the clock can never
 * disagree about how far into the run the player is.
 */
export function elapsed(state: CountdownState, durationMs: number): number {
  return durationMs - state.remainingMs;
}
