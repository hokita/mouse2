import { describe, expect, it } from 'vitest';
import { intersects, rectAt } from '../collision';

describe('rectAt', () => {
  it('centres the rect on the given point', () => {
    expect(rectAt(100, 50, 40, 20)).toEqual({ x: 80, y: 40, width: 40, height: 20 });
  });

  it('handles odd sizes without drifting off centre', () => {
    const rect = rectAt(0, 0, 30, 50);
    expect(rect.x + rect.width / 2).toBe(0);
    expect(rect.y + rect.height / 2).toBe(0);
  });
});

describe('intersects', () => {
  it('returns true when rectangles overlap', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(true);
  });

  it('returns false when rectangles do not overlap', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 20, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(false);
  });

  it('returns false when rectangles only touch at an edge', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(false);
  });

  it('is symmetric regardless of argument order', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(intersects(b, a));
  });
});
