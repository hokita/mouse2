import { describe, expect, it } from 'vitest';
import { wobbleX } from '../wobble';

describe('wobbleX', () => {
  it('returns baseX at time zero', () => {
    expect(wobbleX(100, 0, 60, 2000)).toBe(100);
  });

  it('peaks at baseX + amplitude a quarter period in', () => {
    expect(wobbleX(100, 500, 60, 2000)).toBeCloseTo(160, 5);
  });

  it('returns to baseX at half period', () => {
    expect(wobbleX(100, 1000, 60, 2000)).toBeCloseTo(100, 5);
  });

  it('dips to baseX - amplitude at three quarter period', () => {
    expect(wobbleX(100, 1500, 60, 2000)).toBeCloseTo(40, 5);
  });
});
