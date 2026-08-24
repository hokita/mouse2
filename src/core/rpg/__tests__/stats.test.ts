import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, expToReach, levelForExp, statsAtLevel } from '../stats';
import type { Stats } from '../stats';

const BASE: Stats = { maxHp: 40, maxMp: 10, atk: 12, mag: 6, def: 8, spd: 9 };
const GROWTH: Stats = { maxHp: 6, maxMp: 2, atk: 2, mag: 1, def: 1, spd: 1 };

describe('statsAtLevel', () => {
  it('is the base block at level 1', () => {
    expect(statsAtLevel(BASE, GROWTH, 1)).toEqual(BASE);
  });

  it('adds one growth block per level gained', () => {
    expect(statsAtLevel(BASE, GROWTH, 3)).toEqual({
      maxHp: 52,
      maxMp: 14,
      atk: 16,
      mag: 8,
      def: 10,
      spd: 11,
    });
  });

  it('clamps below level 1 rather than shrinking the character', () => {
    expect(statsAtLevel(BASE, GROWTH, 0)).toEqual(BASE);
  });
});

describe('expToReach', () => {
  it('costs nothing to be level 1', () => {
    expect(expToReach(1)).toBe(0);
  });

  it('climbs with every level', () => {
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      expect(expToReach(level)).toBeGreaterThan(expToReach(level - 1));
    }
  });

  it('gets steeper, so late levels are earned rather than drifted into', () => {
    const early = expToReach(3) - expToReach(2);
    const late = expToReach(MAX_LEVEL) - expToReach(MAX_LEVEL - 1);
    expect(late).toBeGreaterThan(early * 2);
  });
});

describe('levelForExp', () => {
  it('starts at level 1 with nothing banked', () => {
    expect(levelForExp(0)).toBe(1);
  });

  it('agrees with the curve exactly at each threshold', () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      expect(levelForExp(expToReach(level))).toBe(level);
      expect(levelForExp(expToReach(level) - 1)).toBe(level - 1 || 1);
    }
  });

  it('stops at the cap however much is banked', () => {
    expect(levelForExp(expToReach(MAX_LEVEL) * 100)).toBe(MAX_LEVEL);
  });
});
