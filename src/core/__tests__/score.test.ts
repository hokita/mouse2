import { describe, expect, it } from 'vitest';
import { createScore, tickScore, getScoreValue } from '../score';

describe('score', () => {
  it('starts at zero', () => {
    const state = createScore();
    expect(getScoreValue(state)).toBe(0);
  });

  it('increases as time elapses', () => {
    let state = createScore();
    state = tickScore(state, 250);
    expect(getScoreValue(state)).toBe(2);
  });

  it('accumulates elapsed time across multiple ticks', () => {
    let state = createScore();
    state = tickScore(state, 60);
    state = tickScore(state, 60);
    expect(getScoreValue(state)).toBe(1);
  });
});
