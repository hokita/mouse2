import { describe, expect, it } from 'vitest';
import { CATCH_POINTS, RARITIES, castProgress, catchWeight, pickCatch } from '../haul';

describe('castProgress', () => {
  it('walks 0 to 1 across the run', () => {
    expect(castProgress(0, 8)).toBe(0);
    expect(castProgress(7, 8)).toBe(1);
    expect(castProgress(3.5, 8)).toBeCloseTo(0.5);
  });

  it('treats a single cast as the end of the run', () => {
    expect(castProgress(0, 1)).toBe(1);
  });
});

describe('catchWeight', () => {
  it('drains the common fish and feeds the golden one as the run goes on', () => {
    expect(catchWeight('common', 0)).toBeGreaterThan(catchWeight('common', 1));
    expect(catchWeight('golden', 0)).toBeLessThan(catchWeight('golden', 1));
  });

  it('keeps every weight positive at both ends', () => {
    for (const rarity of RARITIES) {
      expect(catchWeight(rarity, 0)).toBeGreaterThan(0);
      expect(catchWeight(rarity, 1)).toBeGreaterThan(0);
    }
  });
});

describe('pickCatch', () => {
  it('walks the rarities in order as the roll climbs', () => {
    // At t=0 the weights are 58/26/12/4 of 100: rolls at the centre of each
    // slice land squarely on that rarity.
    expect(pickCatch(0, 8, () => 0.2)).toBe('common');
    expect(pickCatch(0, 8, () => 0.7)).toBe('fine');
    expect(pickCatch(0, 8, () => 0.9)).toBe('big');
    expect(pickCatch(0, 8, () => 0.99)).toBe('golden');
  });

  it('lands a rounding-edge roll of 1 on a real rarity', () => {
    expect(RARITIES).toContain(pickCatch(0, 8, () => 1));
  });

  it('pays more for rarer fish', () => {
    for (let i = 1; i < RARITIES.length; i += 1) {
      expect(CATCH_POINTS[RARITIES[i]]).toBeGreaterThan(CATCH_POINTS[RARITIES[i - 1]]);
    }
  });
});
