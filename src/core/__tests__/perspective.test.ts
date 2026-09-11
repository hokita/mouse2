import { describe, expect, it } from 'vitest';
import { depthOfPixels, scaleAt, screenXAt, screenYAt } from '../perspective';
import type { Camera } from '../perspective';

// An eye 260 m behind the player's row and 300 units above the road, with 600
// px of screen between the horizon and the row it is looking at.
const EYE: Camera = { horizonY: 200, baseY: 800, centerX: 200, depth: 260, height: 300 };

describe('scaleAt', () => {
  it('is exactly 1:1 at the player row', () => {
    expect(scaleAt(EYE, 0)).toBe(1);
  });

  it('halves one camera-depth further down the road', () => {
    expect(scaleAt(EYE, 260)).toBeCloseTo(0.5);
    expect(scaleAt(EYE, 780)).toBeCloseTo(0.25);
  });

  it('grows for the road behind the player, which is nearer the eye', () => {
    expect(scaleAt(EYE, -130)).toBeCloseTo(2);
  });

  it('gives up rather than mirroring the world behind the eye', () => {
    expect(scaleAt(EYE, -260)).toBe(0);
    expect(scaleAt(EYE, -400)).toBe(0);
  });

  it('shrinks all the way down the road and never reaches nothing', () => {
    let previous = Infinity;
    for (let z = 0; z <= 6000; z += 20) {
      const scale = scaleAt(EYE, z);
      expect(scale).toBeLessThan(previous);
      expect(scale).toBeGreaterThan(0);
      previous = scale;
    }
  });
});

describe('screenXAt', () => {
  it('leaves the player row untouched', () => {
    expect(screenXAt(EYE, 0, -185)).toBe(15);
    expect(screenXAt(EYE, 0, 185)).toBe(385);
  });

  it('pulls both edges of the road in by the same amount', () => {
    const left = screenXAt(EYE, 260, -185);
    const right = screenXAt(EYE, 260, 185);
    expect(200 - left).toBeCloseTo(right - 200);
  });

  it('narrows the road toward the vanishing point without ever crossing it', () => {
    let previous = 400;
    for (let z = 0; z <= 6000; z += 20) {
      const right = screenXAt(EYE, z, 185);
      expect(right).toBeLessThan(previous);
      expect(right).toBeGreaterThan(200);
      previous = right;
    }
  });
});

describe('screenYAt', () => {
  it('puts level ground under the player at the player row', () => {
    expect(screenYAt(EYE, 0)).toBe(800);
  });

  it('runs level ground away to the horizon without ever quite reaching it', () => {
    expect(screenYAt(EYE, 100_000)).toBeGreaterThan(200);
    expect(screenYAt(EYE, 100_000)).toBeLessThan(202);
  });

  it('lifts ground that rises, and lifts near ground more than far', () => {
    const nearFlat = screenYAt(EYE, 260, 0);
    const nearHill = screenYAt(EYE, 260, 60);
    const farFlat = screenYAt(EYE, 1300, 0);
    const farHill = screenYAt(EYE, 1300, 60);
    expect(nearHill).toBeLessThan(nearFlat);
    expect(farHill).toBeLessThan(farFlat);
    expect(nearFlat - nearHill).toBeGreaterThan(farFlat - farHill);
  });

  it('drops ground that falls away below where level ground would be', () => {
    expect(screenYAt(EYE, 260, -60)).toBeGreaterThan(screenYAt(EYE, 260, 0));
  });

  it('holds ground at eye height level with the horizon, however far off', () => {
    for (const z of [200, 900, 4000]) {
      expect(screenYAt(EYE, z, EYE.height)).toBeCloseTo(200);
    }
  });

  it('carries ground above eye height over the horizon', () => {
    expect(screenYAt(EYE, 600, EYE.height * 1.4)).toBeLessThan(200);
  });
});

describe('depthOfPixels', () => {
  it('gives back no road for no pixels', () => {
    expect(depthOfPixels(EYE, 0)).toBe(0);
  });

  it('is the road a height on screen stands on at the player row', () => {
    // Walk that far down the road and the ground has climbed the screen by
    // exactly the pixels asked about, which is what makes it the right length
    // to hit a thing of that height at.
    for (const pixels of [10, 50, 120, 400]) {
      expect(EYE.baseY - screenYAt(EYE, depthOfPixels(EYE, pixels))).toBeCloseTo(pixels);
    }
  });

  it('costs more road per pixel the higher up the screen it is asked about', () => {
    expect(depthOfPixels(EYE, 100)).toBeGreaterThan(depthOfPixels(EYE, 50) * 2);
  });

  it('gives up at the horizon, which no length of road reaches', () => {
    expect(depthOfPixels(EYE, 600)).toBe(Infinity);
    expect(depthOfPixels(EYE, 900)).toBe(Infinity);
  });

  it('gives a nearer eye less road per pixel', () => {
    const near: Camera = { ...EYE, depth: 130 };
    expect(depthOfPixels(near, 50)).toBeLessThan(depthOfPixels(EYE, 50));
  });
});
