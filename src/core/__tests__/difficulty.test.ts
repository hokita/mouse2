import { describe, expect, it } from 'vitest';
import { spawnRange } from '../difficulty';

describe('spawnRange', () => {
  it('starts at the gentle opening rate', () => {
    expect(spawnRange(0)).toEqual({ min: 1500, max: 2500 });
  });

  it('reaches the floor at the end of the ramp', () => {
    expect(spawnRange(90_000)).toEqual({ min: 400, max: 700 });
  });

  it('interpolates linearly halfway through the ramp', () => {
    const range = spawnRange(45_000);
    expect(range.min).toBeCloseTo(950, 5);
    expect(range.max).toBeCloseTo(1600, 5);
  });

  it('holds at the floor beyond the ramp', () => {
    expect(spawnRange(600_000)).toEqual({ min: 400, max: 700 });
  });

  it('clamps negative elapsed time to the opening rate', () => {
    expect(spawnRange(-1000)).toEqual({ min: 1500, max: 2500 });
  });
});
