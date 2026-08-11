import { describe, expect, it } from 'vitest';
import { createScore, addPoints, getScoreValue } from '../score';

describe('score', () => {
  it('starts at zero', () => {
    expect(getScoreValue(createScore())).toBe(0);
  });

  it('adds points per kill', () => {
    let state = createScore();
    state = addPoints(state, 10);
    expect(getScoreValue(state)).toBe(10);
  });

  it('accumulates points across kills', () => {
    let state = createScore();
    state = addPoints(state, 10);
    state = addPoints(state, 10);
    expect(getScoreValue(state)).toBe(20);
  });
});
