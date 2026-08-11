import { describe, expect, it } from 'vitest';
import { speedAt } from '../speed';

const RAMP = { base: 100, max: 300, rampMs: 1000 };

describe('speedAt', () => {
  it('starts at the base speed', () => {
    expect(speedAt(0, RAMP)).toBe(100);
  });

  it('interpolates linearly partway through the ramp', () => {
    expect(speedAt(500, RAMP)).toBe(200);
  });

  it('reaches the max speed at the end of the ramp', () => {
    expect(speedAt(1000, RAMP)).toBe(300);
  });

  it('holds at the max speed after the ramp', () => {
    expect(speedAt(999_999, RAMP)).toBe(300);
  });

  it('never dips below the base speed for a negative elapsed time', () => {
    expect(speedAt(-500, RAMP)).toBe(100);
  });

  it('returns the max speed immediately for a zero-length ramp', () => {
    expect(speedAt(0, { base: 100, max: 300, rampMs: 0 })).toBe(300);
  });
});
