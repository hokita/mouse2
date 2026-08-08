import { describe, expect, it } from 'vitest';
import { intersects } from '../collision';

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
