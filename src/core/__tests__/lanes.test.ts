import { describe, expect, it } from 'vitest';
import { freeLanes, laneCenterX, pickSpawnLane } from '../lanes';

describe('laneCenterX', () => {
  it('centres the first lane in the first slice of the road', () => {
    expect(laneCenterX(0, 3, 30, 300)).toBe(80);
  });

  it('centres the middle lane on the middle of the road', () => {
    expect(laneCenterX(1, 3, 30, 300)).toBe(180);
  });

  it('centres the last lane in the last slice of the road', () => {
    expect(laneCenterX(2, 3, 30, 300)).toBe(280);
  });

  it('keeps every lane centre inside the road', () => {
    for (let lane = 0; lane < 4; lane += 1) {
      const x = laneCenterX(lane, 4, 30, 300);
      expect(x).toBeGreaterThan(30);
      expect(x).toBeLessThan(330);
    }
  });
});

describe('freeLanes', () => {
  it('returns every lane when nothing is occupied', () => {
    expect(freeLanes([], 3)).toEqual([0, 1, 2]);
  });

  it('omits occupied lanes', () => {
    expect(freeLanes([1], 3)).toEqual([0, 2]);
  });

  it('tolerates duplicate occupants of the same lane', () => {
    expect(freeLanes([1, 1, 1], 3)).toEqual([0, 2]);
  });

  it('returns nothing when every lane is occupied', () => {
    expect(freeLanes([0, 1, 2], 3)).toEqual([]);
  });
});

describe('pickSpawnLane', () => {
  it('picks the first free lane when random() returns 0', () => {
    expect(pickSpawnLane([1], 3, () => 0)).toBe(0);
  });

  it('picks the last free lane when random() returns just under 1', () => {
    expect(pickSpawnLane([1], 3, () => 0.999)).toBe(2);
  });

  it('stays in range even if random() returns exactly 1', () => {
    expect(pickSpawnLane([], 3, () => 1)).toBe(2);
  });

  it('never picks an occupied lane', () => {
    for (const r of [0, 0.34, 0.5, 0.67, 0.99]) {
      expect(pickSpawnLane([1], 3, () => r)).not.toBe(1);
    }
  });

  it('refuses to spawn when doing so would leave only one open lane', () => {
    expect(pickSpawnLane([0], 3, () => 0)).not.toBeNull();
    expect(pickSpawnLane([0, 1], 3, () => 0)).toBeNull();
  });

  it('refuses to spawn when every lane is already occupied', () => {
    expect(pickSpawnLane([0, 1, 2], 3, () => 0)).toBeNull();
  });
});
