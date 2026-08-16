import { describe, expect, it } from 'vitest';
import { BAND_COUNT, BAND_POINTS, bandCenterY, depthBandAt } from '../depth';

const TOP = 200;
const BOTTOM = 800;

describe('depthBandAt', () => {
  it('splits the column into equal bands, shallowest first', () => {
    expect(depthBandAt(200, TOP, BOTTOM, 3)).toBe(0);
    expect(depthBandAt(399, TOP, BOTTOM, 3)).toBe(0);
    expect(depthBandAt(400, TOP, BOTTOM, 3)).toBe(1);
    expect(depthBandAt(599, TOP, BOTTOM, 3)).toBe(1);
    expect(depthBandAt(600, TOP, BOTTOM, 3)).toBe(2);
    expect(depthBandAt(799, TOP, BOTTOM, 3)).toBe(2);
  });

  it('clamps a bobbing swimmer that drifts past either edge of the column', () => {
    expect(depthBandAt(TOP - 10, TOP, BOTTOM, 3)).toBe(0);
    expect(depthBandAt(BOTTOM + 10, TOP, BOTTOM, 3)).toBe(BAND_COUNT - 1);
  });

  it('lands the exact bottom edge in the deepest band, not one past it', () => {
    expect(depthBandAt(BOTTOM, TOP, BOTTOM, 3)).toBe(2);
  });

  it('returns band 0 for degenerate columns rather than dividing by zero', () => {
    expect(depthBandAt(500, TOP, TOP, 3)).toBe(0);
    expect(depthBandAt(500, TOP, BOTTOM, 1)).toBe(0);
    expect(depthBandAt(500, TOP, BOTTOM, 0)).toBe(0);
  });
});

describe('bandCenterY', () => {
  it('anchors each band at its middle depth', () => {
    expect(bandCenterY(0, TOP, BOTTOM, 3)).toBe(300);
    expect(bandCenterY(1, TOP, BOTTOM, 3)).toBe(500);
    expect(bandCenterY(2, TOP, BOTTOM, 3)).toBe(700);
  });

  it('round-trips with depthBandAt for every band', () => {
    for (let band = 0; band < BAND_COUNT; band += 1) {
      expect(depthBandAt(bandCenterY(band, TOP, BOTTOM), TOP, BOTTOM)).toBe(band);
    }
  });
});

describe('BAND_POINTS', () => {
  it('has one payout per band, strictly increasing with depth', () => {
    expect(BAND_POINTS).toHaveLength(BAND_COUNT);
    for (let band = 1; band < BAND_COUNT; band += 1) {
      expect(BAND_POINTS[band]).toBeGreaterThan(BAND_POINTS[band - 1]);
    }
  });
});
