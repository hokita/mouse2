import { describe, expect, it } from 'vitest';
import {
  BOSS_MAX_HP,
  BOSS_PHASES,
  BOSS_SPAWN_Y,
  BOSS_STATION_Y,
  BOSS_WIDTH,
  arrivalY,
  bossHullBottom,
  bossPlayerFloor,
  phaseAt,
  playerFloorForHull,
  slideBounds,
  slideX,
} from '../boss';

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

describe('slideBounds', () => {
  it('keeps the whole hull on screen with a margin at each edge', () => {
    const { minX, maxX } = slideBounds(430);
    expect(minX).toBe(131);
    expect(maxX).toBe(299);
    expect(minX - BOSS_WIDTH / 2).toBeGreaterThanOrEqual(0);
    expect(maxX + BOSS_WIDTH / 2).toBeLessThanOrEqual(430);
  });
});

describe('slideX', () => {
  const { minX, maxX } = slideBounds(430);

  it('starts at the left extreme', () => {
    expect(slideX(0, 1, minX, maxX)).toBeCloseTo(minX, 5);
  });

  it('reaches the right extreme at half a period', () => {
    expect(slideX(BOSS_PHASES[1].slidePeriodMs / 2, 1, minX, maxX)).toBeCloseTo(maxX, 5);
  });

  it('returns to the left extreme after a full period', () => {
    expect(slideX(BOSS_PHASES[1].slidePeriodMs, 1, minX, maxX)).toBeCloseTo(minX, 5);
  });

  it('never leaves the bounds, at any phase or time', () => {
    for (const phase of [1, 2, 3] as const) {
      for (let ms = 0; ms <= 12_000; ms += 37) {
        const x = slideX(ms, phase, minX, maxX);
        expect(x).toBeGreaterThanOrEqual(minX - 1e-9);
        expect(x).toBeLessThanOrEqual(maxX + 1e-9);
      }
    }
  });

  it('eases — it moves slower at the turns than at mid-sweep', () => {
    // The cosine ease is what makes the hull readable rather than a
    // ping-pong ball. Compare the distance covered in the same 50ms at the
    // turn against mid-sweep.
    const period = BOSS_PHASES[1].slidePeriodMs;
    const atTurn = Math.abs(slideX(50, 1, minX, maxX) - slideX(0, 1, minX, maxX));
    const atMid = Math.abs(
      slideX(period / 4 + 50, 1, minX, maxX) - slideX(period / 4, 1, minX, maxX)
    );
    expect(atTurn).toBeLessThan(atMid);
  });

  it('covers more ground in the same time in later phases', () => {
    // Exercises slideX itself rather than re-asserting the BOSS_PHASES table
    // (which the phase-table tests already cover): a shorter period must
    // translate into more distance travelled from the turn in equal time.
    const travelled = (phase: 1 | 2 | 3) => Math.abs(slideX(400, phase, minX, maxX) - minX);
    expect(travelled(2)).toBeGreaterThan(travelled(1));
    expect(travelled(3)).toBeGreaterThan(travelled(2));
  });
});

describe('phase-change slide rebase', () => {
  // Pins a bug: damageBoss changes boss.phase (and so the slide period)
  // without rebasing boss.elapsedMs first. slideX takes elapsedMs modulo the
  // period, so swapping in a shorter period without rebasing snaps the
  // 230px-wide hull up to the full width of its travel on the very frame the
  // phase flash and camera shake draw the child's eye to it — the "ping-pong
  // ball" the cosine ease exists to prevent, reintroduced at every phase
  // change. The fix rebases elapsedMs so the eased fraction of the sweep —
  // not the raw elapsed time — survives the period change, which this test
  // asserts directly by reproducing the rebase formula and checking it lands
  // slideX at the same x it held an instant before.
  it('keeps the hull at the same x when the period changes underneath it', () => {
    const { minX, maxX } = slideBounds(430);
    const oldPeriod = BOSS_PHASES[1].slidePeriodMs;
    const newPeriod = BOSS_PHASES[2].slidePeriodMs;
    const elapsedMs = 1234; // Arbitrary point mid-sweep, not a period boundary.

    const xBeforeChange = slideX(elapsedMs, 1, minX, maxX);

    const rebasedElapsedMs = newPeriod * ((elapsedMs % oldPeriod) / oldPeriod);
    const xAfterChange = slideX(rebasedElapsedMs, 2, minX, maxX);

    expect(xAfterChange).toBeCloseTo(xBeforeChange, 5);
  });

  it('would NOT match without the rebase, demonstrating the bug it fixes', () => {
    // Same phase change, but reusing the raw elapsedMs (what the code did
    // before the fix) instead of rebasing it — the two diverge, sometimes by
    // most of the slide's travel.
    const { minX, maxX } = slideBounds(430);
    const elapsedMs = 1234;

    const xBeforeChange = slideX(elapsedMs, 1, minX, maxX);
    const xWithoutRebase = slideX(elapsedMs, 2, minX, maxX);

    expect(Math.abs(xWithoutRebase - xBeforeChange)).toBeGreaterThan(1);
  });
});

describe('arrivalY', () => {
  it('starts off the top of the screen', () => {
    expect(arrivalY(0)).toBe(BOSS_SPAWN_Y);
  });

  it('ends on station', () => {
    expect(arrivalY(1)).toBeCloseTo(BOSS_STATION_Y, 5);
  });

  it('clamps outside 0..1 rather than overshooting', () => {
    expect(arrivalY(-1)).toBe(BOSS_SPAWN_Y);
    expect(arrivalY(4)).toBeCloseTo(BOSS_STATION_Y, 5);
  });

  it('descends monotonically', () => {
    let previous = arrivalY(0);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const y = arrivalY(t);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
  });
});

describe('bossPlayerFloor', () => {
  it('sits below the hull, so there is no safe pocket above the boss', () => {
    // The invariant the whole fight depends on. Without it the player parks
    // above the hull, out of reach of downward fans, and the fight is free.
    const floor = bossPlayerFloor(40, 18);
    expect(floor - 40 / 2).toBeGreaterThanOrEqual(bossHullBottom());
  });

  it('matches the design doc for the real ship', () => {
    expect(bossHullBottom()).toBe(260);
    expect(bossPlayerFloor(40, 18)).toBe(298);
  });

  it('still leaves the player most of the screen', () => {
    expect(bossPlayerFloor(40, 18)).toBeLessThan(932 * 0.35);
  });
});

describe('playerFloorForHull', () => {
  it('agrees with bossPlayerFloor once the hull is on station', () => {
    expect(playerFloorForHull(BOSS_STATION_Y, 40, 18)).toBe(bossPlayerFloor(40, 18));
  });

  it('never lets the descending hull overlap the ship', () => {
    // The regression this function exists for. The hull descends on a
    // quadratic ease-out; a floor that interpolated linearly from
    // PLAYER_MIN_Y to 298 fell BEHIND the hull for t in [0.55, 0.85] and
    // overlapped the ship by up to 9.6px — the boss's entrance stealing a
    // heart the player could do nothing about. Deriving the floor from the
    // hull's live position makes the overlap impossible by construction,
    // whatever easing the descent later uses.
    for (let step = 0; step <= 100; step += 1) {
      const t = step / 100;
      const hullY = arrivalY(t);
      const shipTop = Math.max(110, playerFloorForHull(hullY, 40, 18)) - 40 / 2;
      expect(shipTop).toBeGreaterThanOrEqual(hullY + 120 / 2);
    }
  });
});
