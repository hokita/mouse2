import { describe, expect, it } from 'vitest';
import { levelIndexAt } from '../levels';

describe('levelIndexAt', () => {
  it('starts on the first level', () => {
    expect(levelIndexAt(0, 12_000, 5)).toBe(0);
  });

  it('stays on a level for the whole step', () => {
    expect(levelIndexAt(11_999, 12_000, 5)).toBe(0);
  });

  it('steps up exactly on the boundary', () => {
    expect(levelIndexAt(12_000, 12_000, 5)).toBe(1);
  });

  it('advances one step at a time', () => {
    expect(levelIndexAt(36_000, 12_000, 5)).toBe(3);
  });

  it('holds the last level for the rest of the run', () => {
    expect(levelIndexAt(600_000, 12_000, 5)).toBe(4);
  });

  it('treats a single-level ladder as always level zero', () => {
    expect(levelIndexAt(99_999, 12_000, 1)).toBe(0);
  });

  it('does not divide by a zero step', () => {
    expect(levelIndexAt(5_000, 0, 5)).toBe(0);
  });

  it('clamps a negative elapsed time to the first level', () => {
    expect(levelIndexAt(-5_000, 12_000, 5)).toBe(0);
  });
});
