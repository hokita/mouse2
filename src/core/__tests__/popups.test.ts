import { describe, expect, it } from 'vitest';
import { POINTS, pickFreeHole, pickKind } from '../popups';

const ODDS = { rare: 0.1, trash: 0.25 };

describe('pickKind', () => {
  it('gives the rare fish the bottom slice of the roll', () => {
    expect(pickKind(ODDS, () => 0)).toBe('rare');
    expect(pickKind(ODDS, () => 0.099)).toBe('rare');
  });

  it('gives trash the slice above it', () => {
    expect(pickKind(ODDS, () => 0.1)).toBe('trash');
    expect(pickKind(ODDS, () => 0.349)).toBe('trash');
  });

  it('gives everything left over to an ordinary fish', () => {
    expect(pickKind(ODDS, () => 0.35)).toBe('fish');
    expect(pickKind(ODDS, () => 0.999)).toBe('fish');
  });

  it('never yields a rare fish when its odds are zero', () => {
    expect(pickKind({ rare: 0, trash: 0.5 }, () => 0)).toBe('trash');
  });

  it('only ever yields fish when both odds are zero', () => {
    expect(pickKind({ rare: 0, trash: 0 }, () => 0)).toBe('fish');
  });
});

describe('pickFreeHole', () => {
  it('picks from the holes nothing is using', () => {
    expect(pickFreeHole([0, 1, 2], 4, () => 0)).toBe(3);
  });

  it('spreads its picks across every free hole', () => {
    expect(pickFreeHole([1], 4, () => 0)).toBe(0);
    expect(pickFreeHole([1], 4, () => 0.5)).toBe(2);
    expect(pickFreeHole([1], 4, () => 0.99)).toBe(3);
  });

  it('does not run off the end of the free list when random() returns 1', () => {
    expect(pickFreeHole([], 3, () => 1)).toBe(2);
  });

  it('refuses to spawn when every hole is busy', () => {
    expect(pickFreeHole([0, 1, 2], 3, () => 0)).toBeNull();
  });
});

describe('POINTS', () => {
  it('makes the rare fish worth chasing', () => {
    expect(POINTS.rare).toBeGreaterThan(POINTS.fish);
  });

  it('is the only place a catch costs the player anything', () => {
    expect(POINTS.trash).toBeLessThan(0);
    expect(POINTS.fish).toBeGreaterThan(0);
  });
});
