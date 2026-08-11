export interface LivesState {
  lives: number;
  invincibleMs: number;
}

export function createLives(count: number): LivesState {
  return { lives: count, invincibleMs: 0 };
}

export function isInvincible(state: LivesState): boolean {
  return state.invincibleMs > 0;
}

export function hit(
  state: LivesState,
  invincibilityMs: number
): { state: LivesState; tookHit: boolean; dead: boolean } {
  if (isInvincible(state)) {
    return { state, tookHit: false, dead: false };
  }
  const lives = state.lives - 1;
  return {
    state: { lives, invincibleMs: invincibilityMs },
    tookHit: true,
    dead: lives <= 0,
  };
}

export function tickLives(state: LivesState, dt: number): LivesState {
  return { ...state, invincibleMs: Math.max(0, state.invincibleMs - dt) };
}
