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

  it('subtracts a penalty', () => {
    let state = createScore();
    state = addPoints(state, 30);
    state = addPoints(state, -15);
    expect(getScoreValue(state)).toBe(15);
  });

  it('goes below zero when no floor is asked for', () => {
    expect(getScoreValue(addPoints(createScore(), -15))).toBe(-15);
  });

  it('holds at the floor instead of going under it', () => {
    let state = addPoints(createScore(), 10, 0);
    state = addPoints(state, -15, 0);
    expect(getScoreValue(state)).toBe(0);
  });

  it('keeps scoring normally from the floor', () => {
    let state = addPoints(createScore(), -15, 0);
    state = addPoints(state, 10, 0);
    expect(getScoreValue(state)).toBe(10);
  });
});
