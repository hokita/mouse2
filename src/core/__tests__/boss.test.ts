import { describe, expect, it } from 'vitest';
import { BOSS_MAX_HP, BOSS_PHASES, phaseAt } from '../boss';

describe('phaseAt', () => {
  it('opens in phase 1 at full health', () => {
    expect(phaseAt(BOSS_MAX_HP)).toBe(1);
  });

  it('splits the bar into three equal runs of 15 hits', () => {
    // The table in the design doc: 45-31, 30-16, 15-0. Asserted at the
    // boundaries rather than the middles, because the boundaries are where
    // an off-by-one silently turns one phase into 14 hits and its neighbour
    // into 16.
    expect(phaseAt(31)).toBe(1);
    expect(phaseAt(30)).toBe(2);
    expect(phaseAt(16)).toBe(2);
    expect(phaseAt(15)).toBe(3);
    expect(phaseAt(1)).toBe(3);
  });

  it('keeps the split proportional when max HP changes', () => {
    // Phases are fractions of max, not hardcoded HP, so retuning BOSS_MAX_HP
    // cannot silently unbalance them.
    expect(phaseAt(100, 100)).toBe(1);
    expect(phaseAt(67, 100)).toBe(1);
    expect(phaseAt(66, 100)).toBe(2);
    expect(phaseAt(34, 100)).toBe(2);
    expect(phaseAt(33, 100)).toBe(3);
  });

  it('treats a dead boss as phase 3', () => {
    expect(phaseAt(0)).toBe(3);
  });
});

describe('BOSS_PHASES', () => {
  it('escalates: each phase slides faster and fires sooner than the last', () => {
    expect(BOSS_PHASES[2].slidePeriodMs).toBeLessThan(BOSS_PHASES[1].slidePeriodMs);
    expect(BOSS_PHASES[3].slidePeriodMs).toBeLessThan(BOSS_PHASES[2].slidePeriodMs);
    expect(BOSS_PHASES[2].fireIntervalMs).toBeLessThanOrEqual(BOSS_PHASES[1].fireIntervalMs);
    expect(BOSS_PHASES[3].fireIntervalMs).toBeLessThanOrEqual(BOSS_PHASES[2].fireIntervalMs);
  });

  it('only aims in the last phase', () => {
    expect(BOSS_PHASES[1].aimedIntervalMs).toBeNull();
    expect(BOSS_PHASES[2].aimedIntervalMs).toBeNull();
    expect(BOSS_PHASES[3].aimedIntervalMs).toBe(2200);
  });

  it('widens the fan after phase 1', () => {
    expect(BOSS_PHASES[1].fanCount).toBe(3);
    expect(BOSS_PHASES[2].fanCount).toBe(5);
    expect(BOSS_PHASES[3].fanCount).toBe(5);
    expect(BOSS_PHASES[2].fanSpreadRadians).toBeGreaterThan(BOSS_PHASES[1].fanSpreadRadians);
  });
});
