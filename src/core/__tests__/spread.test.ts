import { describe, expect, it } from 'vitest';
import { fanVelocities } from '../spread';

describe('fanVelocities', () => {
  it('sends a single bullet straight down', () => {
    expect(fanVelocities(1, Math.PI / 2, 150)).toEqual([{ vx: 0, vy: 150 }]);
  });

  it('aims the middle bullet of an odd fan straight down', () => {
    const middle = fanVelocities(5, Math.PI * (80 / 180), 150)[2];
    expect(middle.vx).toBeCloseTo(0, 5);
    expect(middle.vy).toBeCloseTo(150, 5);
  });

  it('places the outer bullets at half the spread either side', () => {
    const fan = fanVelocities(5, Math.PI * (80 / 180), 150);
    expect(fan[0].vx).toBeCloseTo(-Math.sin(Math.PI * (40 / 180)) * 150, 5);
    expect(fan[4].vx).toBeCloseTo(Math.sin(Math.PI * (40 / 180)) * 150, 5);
  });

  it('mirrors the fan about straight down', () => {
    const fan = fanVelocities(4, Math.PI / 3, 200);
    expect(fan[0].vx).toBeCloseTo(-fan[3].vx, 5);
    expect(fan[1].vx).toBeCloseTo(-fan[2].vx, 5);
  });

  it('gives every bullet the same speed', () => {
    for (const { vx, vy } of fanVelocities(5, Math.PI * (80 / 180), 150)) {
      expect(Math.hypot(vx, vy)).toBeCloseTo(150, 5);
    }
  });
});
