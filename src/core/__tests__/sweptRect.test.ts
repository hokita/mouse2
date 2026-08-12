import { describe, expect, it } from 'vitest';
import { movingRectHitsRect } from '../sweptRect';
import { rectAt } from '../collision';

const SHIP = 40;

function shipAt(x: number, y: number) {
  return rectAt(x, y, SHIP, SHIP);
}

describe('movingRectHitsRect', () => {
  it('detects a hit when the mover is already overlapping and does not move', () => {
    const at = shipAt(100, 100);
    expect(movingRectHitsRect(at, at, rectAt(110, 110, 50, 83))).toBe(true);
  });

  it('reports no hit when a stationary mover is clear', () => {
    const at = shipAt(100, 100);
    expect(movingRectHitsRect(at, at, rectAt(300, 300, 50, 83))).toBe(false);
  });

  it('ignores a target sitting in the corner of the motion box that the path misses', () => {
    // The ship travels (100,300) -> (200,400). An axis-aligned union of those
    // two rects spans x[80,220] y[280,420], which contains this target — but
    // the ship itself passes nowhere near it.
    expect(movingRectHitsRect(shipAt(100, 300), shipAt(200, 400), rectAt(210, 290, 50, 83))).toBe(false);
  });

  it('detects a target the diagonal path actually crosses', () => {
    expect(movingRectHitsRect(shipAt(100, 300), shipAt(200, 400), rectAt(150, 350, 50, 83))).toBe(true);
  });

  it('detects a target the mover jumped clean over in one frame', () => {
    // Tunnelling: neither endpoint overlaps, but the path passes through.
    expect(movingRectHitsRect(shipAt(215, 800), shipAt(215, 200), rectAt(215, 500, 50, 83))).toBe(true);
  });

  it('ignores a target beyond the end of the path', () => {
    expect(movingRectHitsRect(shipAt(215, 800), shipAt(215, 600), rectAt(215, 300, 50, 83))).toBe(false);
  });

  it('ignores a target behind the start of the path', () => {
    expect(movingRectHitsRect(shipAt(215, 600), shipAt(215, 400), rectAt(215, 800, 50, 83))).toBe(false);
  });

  it('detects a purely horizontal graze along the target edge', () => {
    expect(movingRectHitsRect(shipAt(100, 300), shipAt(300, 300), rectAt(200, 320, 50, 20))).toBe(true);
  });
});
