import { describe, expect, it } from 'vitest';
import { CATCH_POINTS, RARITIES } from '../haul';

describe('CATCH_POINTS', () => {
  it('pays more for rarer fish', () => {
    for (let i = 1; i < RARITIES.length; i += 1) {
      expect(CATCH_POINTS[RARITIES[i]]).toBeGreaterThan(CATCH_POINTS[RARITIES[i - 1]]);
    }
  });
});
