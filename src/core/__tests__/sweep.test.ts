import { describe, expect, it } from 'vitest';
import { intersects } from '../collision';
import { sweepX, sweepY } from '../sweep';

const rect = { x: 100, y: 200, width: 40, height: 60 };

describe('sweepX', () => {
  it('covers a leftward move', () => {
    expect(sweepX(rect, 20)).toEqual({ x: 20, y: 200, width: 120, height: 60 });
  });

  it('covers a rightward move', () => {
    expect(sweepX(rect, 180)).toEqual({ x: 100, y: 200, width: 120, height: 60 });
  });

  it('returns the rect unchanged when it did not move', () => {
    expect(sweepX(rect, 100)).toEqual(rect);
  });

  it('catches an obstacle the rect jumped clean over', () => {
    const skipped = { x: 60, y: 200, width: 20, height: 60 };
    expect(intersects(rect, skipped)).toBe(false);
    expect(intersects(sweepX(rect, 20), skipped)).toBe(true);
  });
});

describe('sweepY', () => {
  it('covers an upward move', () => {
    expect(sweepY(rect, 100)).toEqual({ x: 100, y: 100, width: 40, height: 160 });
  });

  it('covers a downward move', () => {
    expect(sweepY(rect, 300)).toEqual({ x: 100, y: 200, width: 40, height: 160 });
  });

  it('returns the rect unchanged when it did not move', () => {
    expect(sweepY(rect, 200)).toEqual(rect);
  });

  it('catches an obstacle the rect fell clean past', () => {
    const skipped = { x: 100, y: 140, width: 40, height: 20 };
    expect(intersects(rect, skipped)).toBe(false);
    expect(intersects(sweepY(rect, 100), skipped)).toBe(true);
  });
});
