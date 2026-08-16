import { describe, expect, it } from 'vitest';
import { createSchool, tickSchool } from '../school';
import type { SchoolConfig } from '../school';

const CONFIG: SchoolConfig = {
  bounds: { minX: 20, maxX: 410, minY: 600, maxY: 820 },
  fishCount: 4,
  respawnDelayMs: 2000,
  weights: { common: 50, fine: 28, big: 16, golden: 6 },
  speeds: { common: 40, fine: 55, big: 30, golden: 90 },
  speedJitter: 0.2,
  biteRadius: 60,
  catchRadius: 8,
  lungeSpeed: 160,
  attractAfterMs: 4000,
};

/** Feeds a fixed sequence, then holds at the last value. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const mid = () => 0.5;

describe('createSchool', () => {
  it('spawns the configured number of fish inside the bounds', () => {
    const state = createSchool(CONFIG, mid);
    expect(state.fish).toHaveLength(4);
    for (const fish of state.fish) {
      expect(fish.x).toBeGreaterThanOrEqual(CONFIG.bounds.minX);
      expect(fish.x).toBeLessThanOrEqual(CONFIG.bounds.maxX);
      expect(fish.y).toBeGreaterThanOrEqual(CONFIG.bounds.minY);
      expect(fish.y).toBeLessThanOrEqual(CONFIG.bounds.maxY);
      expect(fish.lunging).toBe(false);
    }
  });

  it('gives every fish a distinct id', () => {
    const state = createSchool(CONFIG, mid);
    const ids = new Set(state.fish.map((fish) => fish.id));
    expect(ids.size).toBe(4);
  });

  it('rolls rarity from the weights', () => {
    // Roll order per fish: rarity, x, y, dir, speed jitter. Weights are
    // 50/28/16/6 of 100: 0 lands common, 0.98 lands golden.
    const state = createSchool(
      { ...CONFIG, fishCount: 2 },
      seq([0, 0.5, 0.5, 0.5, 0.5, 0.98, 0.5, 0.5, 0.5, 0.5])
    );
    expect(state.fish[0].rarity).toBe('common');
    expect(state.fish[1].rarity).toBe('golden');
  });

  it('swims each rarity at its own speed, jittered', () => {
    // Speed roll of 0.5 lands exactly on the base speed.
    const state = createSchool({ ...CONFIG, fishCount: 1 }, seq([0.98, 0.5, 0.5, 0.5, 0.5]));
    expect(state.fish[0].speed).toBeCloseTo(90);
  });
});

describe('tickSchool swimming', () => {
  it('moves each fish along its heading', () => {
    // dir roll 0.5 → swims right; speed 40 px/sec for 500ms → +20px.
    const state = createSchool({ ...CONFIG, fishCount: 1 }, seq([0, 0.5, 0.5, 0.5, 0.5]));
    const before = state.fish[0].x;
    const result = tickSchool(state, 500, null, CONFIG, mid);
    expect(result.state.fish[0].x).toBeCloseTo(before + 20);
  });

  it('turns a fish around at the bounds', () => {
    const state = createSchool({ ...CONFIG, fishCount: 1 }, mid);
    state.fish[0].x = CONFIG.bounds.maxX - 1;
    state.fish[0].dir = 1;
    const result = tickSchool(state, 1000, null, CONFIG, mid);
    expect(result.state.fish[0].dir).toBe(-1);
    expect(result.state.fish[0].x).toBeLessThanOrEqual(CONFIG.bounds.maxX);
  });

  it('refills a thinned school after the respawn delay', () => {
    const config = { ...CONFIG, fishCount: 2 };
    const state = createSchool(config, mid);
    state.fish.pop();
    let result = tickSchool(state, 1900, null, config, mid);
    expect(result.state.fish).toHaveLength(1);
    result = tickSchool(result.state, 200, null, config, mid);
    expect(result.state.fish).toHaveLength(2);
    // The newcomer gets a fresh id, not a recycled one.
    expect(result.state.fish[1].id).toBe(2);
  });

  it('leaves the vertical position of a swimming fish alone', () => {
    const state = createSchool({ ...CONFIG, fishCount: 1 }, mid);
    const before = state.fish[0].y;
    const result = tickSchool(state, 1000, null, CONFIG, mid);
    expect(result.state.fish[0].y).toBe(before);
  });

  it('does not run the respawn clock while the school is full', () => {
    const config = { ...CONFIG, fishCount: 1 };
    const state = createSchool(config, mid);
    const result = tickSchool(state, 5000, null, config, mid);
    expect(result.state.fish).toHaveLength(1);
    expect(result.state.respawnInMs).toBe(CONFIG.respawnDelayMs);
  });
});

describe('tickSchool and the hook', () => {
  const ONE = { ...CONFIG, fishCount: 1 };
  const TWO = { ...CONFIG, fishCount: 2 };

  /** One fish parked at a known spot, pointed right. */
  function schoolAt(x: number, y: number) {
    const state = createSchool(ONE, mid);
    state.fish[0] = { ...state.fish[0], x, y, dir: 1, speed: 40 };
    return state;
  }

  it('sends a fish inside the bite radius lunging at the hook', () => {
    const state = schoolAt(200, 700);
    const result = tickSchool(state, 16, { x: 240, y: 700 }, ONE, mid);
    expect(result.state.fish[0].lunging).toBe(true);
  });

  it('leaves distant fish swimming', () => {
    const state = schoolAt(100, 700);
    const result = tickSchool(state, 16, { x: 240, y: 700 }, ONE, mid);
    expect(result.state.fish[0].lunging).toBe(false);
  });

  it('lets only the nearest fish lunge', () => {
    const state = createSchool(TWO, mid);
    state.fish[0] = { ...state.fish[0], x: 210, y: 700, lunging: false };
    state.fish[1] = { ...state.fish[1], x: 230, y: 700, lunging: false };
    const result = tickSchool(state, 16, { x: 240, y: 700 }, TWO, mid);
    expect(result.state.fish[1].lunging).toBe(true);
    expect(result.state.fish[0].lunging).toBe(false);
  });

  it('moves a lunging fish straight toward the hook', () => {
    let state = schoolAt(200, 720);
    state = tickSchool(state, 0, { x: 240, y: 720 }, ONE, mid).state;
    // Lunge speed 160 px/sec for 100ms → 16px along the line to the hook.
    const result = tickSchool(state, 100, { x: 240, y: 720 }, ONE, mid);
    expect(result.state.fish[0].x).toBeCloseTo(216);
    expect(result.state.fish[0].y).toBeCloseTo(720);
  });

  it('returns the fish as bitten when its lunge reaches the hook', () => {
    let state = schoolAt(236, 700);
    state = tickSchool(state, 0, { x: 240, y: 700 }, ONE, mid).state;
    const result = tickSchool(state, 100, { x: 240, y: 700 }, ONE, mid);
    expect(result.bitten?.id).toBe(state.fish[0].id);
    // The bitten fish is on the line now, not in the water.
    expect(result.state.fish).toHaveLength(0);
  });

  it('calls off the lunge when the hook leaves the water', () => {
    let state = schoolAt(200, 700);
    state = tickSchool(state, 16, { x: 240, y: 700 }, ONE, mid).state;
    const result = tickSchool(state, 16, null, ONE, mid);
    expect(result.state.fish[0].lunging).toBe(false);
  });

  it('pulls the nearest fish in once the hook has idled long enough', () => {
    // Far outside the bite radius, so only the idle clock can start this.
    const state = schoolAt(60, 800);
    const hook = { x: 380, y: 620 };
    let result = tickSchool(state, 3900, hook, ONE, mid);
    expect(result.state.fish[0].lunging).toBe(false);
    result = tickSchool(result.state, 200, hook, ONE, mid);
    expect(result.state.fish[0].lunging).toBe(true);
  });

  it('resets the idle clock when the hook comes out of the water', () => {
    const state = schoolAt(60, 800);
    const hook = { x: 380, y: 620 };
    let result = tickSchool(state, 3900, hook, ONE, mid);
    result = tickSchool(result.state, 100, null, ONE, mid);
    result = tickSchool(result.state, 3900, hook, ONE, mid);
    expect(result.state.fish[0].lunging).toBe(false);
  });
});
