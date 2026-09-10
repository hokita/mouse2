import { describe, expect, it } from 'vitest';
import { depthAt, projectX, scaleAt } from '../perspective';
import type { Perspective } from '../perspective';

// A road 600 px tall on screen between its vanishing point and the player's
// row, converging on x = 200.
const ROAD: Perspective = { horizonY: 200, baseY: 800, centerX: 200 };

describe('scaleAt', () => {
  it('vanishes to nothing at the horizon', () => {
    expect(scaleAt(ROAD, 200)).toBe(0);
  });

  it('is exactly 1:1 at the player row', () => {
    expect(scaleAt(ROAD, 800)).toBe(1);
  });

  it('is half size halfway down to the player', () => {
    expect(scaleAt(ROAD, 500)).toBeCloseTo(0.5);
  });

  it('keeps growing below the player row', () => {
    expect(scaleAt(ROAD, 932)).toBeGreaterThan(1);
  });

  it('clamps above the horizon rather than going negative', () => {
    expect(scaleAt(ROAD, 0)).toBe(0);
    expect(scaleAt(ROAD, -500)).toBe(0);
  });

  it('grows monotonically down the screen', () => {
    let previous = -1;
    for (let y = 200; y <= 932; y += 4) {
      const scale = scaleAt(ROAD, y);
      expect(scale).toBeGreaterThan(previous);
      previous = scale;
    }
  });
});

describe('projectX', () => {
  it('leaves the row it is measured at untouched', () => {
    expect(projectX(ROAD, 30, 800)).toBe(30);
    expect(projectX(ROAD, 370, 800)).toBe(370);
  });

  it('collapses the whole road onto the vanishing point at the horizon', () => {
    expect(projectX(ROAD, 30, 200)).toBe(200);
    expect(projectX(ROAD, 370, 200)).toBe(200);
  });

  it('pulls both edges in by the same amount', () => {
    const left = projectX(ROAD, 30, 500);
    const right = projectX(ROAD, 370, 500);
    expect(200 - left).toBeCloseTo(right - 200);
  });

  it('keeps a lane inside the road edge at every depth', () => {
    for (let y = 210; y <= 932; y += 8) {
      expect(projectX(ROAD, 80, y)).toBeGreaterThan(projectX(ROAD, 30, y));
      expect(projectX(ROAD, 80, y)).toBeLessThan(projectX(ROAD, 370, y));
    }
  });
});

describe('depthAt', () => {
  it('puts the row depth is measured from at zero', () => {
    expect(depthAt(ROAD, 800, 600)).toBeCloseTo(0);
  });

  it('is infinitely far away at the horizon', () => {
    expect(depthAt(ROAD, 200, 600)).toBe(Infinity);
    expect(depthAt(ROAD, 100, 600)).toBe(Infinity);
  });

  it('puts half-scale ground at one camera depth away', () => {
    expect(depthAt(ROAD, 500, 600)).toBeCloseTo(600);
  });

  it('falls monotonically as the ground approaches', () => {
    let previous = Infinity;
    for (let y = 260; y <= 932; y += 4) {
      const depth = depthAt(ROAD, y, 600);
      expect(depth).toBeLessThan(previous);
      previous = depth;
    }
  });

  it('round-trips back through the scale it came from', () => {
    for (const y of [280, 400, 620, 799, 900]) {
      const depth = depthAt(ROAD, y, 600);
      expect(600 / (depth + 600)).toBeCloseTo(scaleAt(ROAD, y));
    }
  });
});
