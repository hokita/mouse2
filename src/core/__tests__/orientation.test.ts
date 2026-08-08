import { describe, expect, it } from 'vitest';
import { isPortrait } from '../orientation';

describe('isPortrait', () => {
  it('returns true when height is greater than width', () => {
    expect(isPortrait(400, 800)).toBe(true);
  });

  it('returns false when width is greater than height', () => {
    expect(isPortrait(800, 400)).toBe(false);
  });

  it('returns false when width equals height (square)', () => {
    expect(isPortrait(500, 500)).toBe(false);
  });
});
