import { describe, expect, it } from 'vitest';
import { spawnRange } from '../difficulty';

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
    // An enemy lives (HEIGHT + 2 * ENEMY_HEIGHT) / ENEMY_FALL_SPEED seconds:
    // (932 + 166) / 90 = 12.2s. Population is that over the mean interval.
    // This is the invariant the floor was chosen against; if either the fall
    // speed or the floor changes, this is what should fail.
    const { min, max } = spawnRange(60_000);
    const meanIntervalMs = (min + max) / 2;
    const lifetimeMs = ((932 + 166) / 90) * 1000;
    expect(lifetimeMs / meanIntervalMs).toBeLessThan(15);
  });
});
