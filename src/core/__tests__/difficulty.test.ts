import { describe, expect, it } from 'vitest';
import { spawnRange } from '../difficulty';
import { enemiesOnScreen } from '../field';

describe('spawnRange', () => {
  it('starts tighter than the pre-ramp game, so the opening seconds are harder', () => {
    expect(spawnRange(0)).toEqual({ min: 1100, max: 1700 });
  });

  it('reaches the floor at the end of the ramp', () => {
    expect(spawnRange(60_000)).toEqual({ min: 700, max: 1000 });
  });

  it('interpolates linearly halfway through the ramp', () => {
    const range = spawnRange(30_000);
    expect(range.min).toBeCloseTo(900, 5);
    expect(range.max).toBeCloseTo(1350, 5);
  });

  it('holds at the floor beyond the ramp', () => {
    expect(spawnRange(600_000)).toEqual({ min: 700, max: 1000 });
  });

  it('clamps negative elapsed time to the opening rate', () => {
    expect(spawnRange(-1000)).toEqual({ min: 1100, max: 1700 });
  });

  it('never lets the floor put more than 15 enemies on screen at once', () => {
    // The invariant the floor was chosen against. Population is computed from
    // the same ENEMY_FALL_SPEED and ENEMY_HEIGHT the game runs on, so raising
    // the fall speed or tightening the floor without revisiting the other
    // fails here rather than quietly rebuilding the wall this replaced.
    const { min, max } = spawnRange(60_000);
    expect(enemiesOnScreen((min + max) / 2)).toBeLessThan(15);
  });
});
