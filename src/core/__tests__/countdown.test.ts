import { describe, expect, it } from 'vitest';
import {
  createCountdown,
  elapsed,
  isFinished,
  secondsLeft,
  tickCountdown,
} from '../countdown';

describe('countdown', () => {
  it('starts with the full duration left', () => {
    expect(createCountdown(60_000).remainingMs).toBe(60_000);
  });

  it('counts down by the frame delta', () => {
    const state = tickCountdown(createCountdown(60_000), 250);
    expect(state.remainingMs).toBe(59_750);
  });

  it('stops at zero instead of going negative', () => {
    const state = tickCountdown(createCountdown(100), 5_000);
    expect(state.remainingMs).toBe(0);
  });

  it('is not finished while time remains', () => {
    expect(isFinished(createCountdown(1))).toBe(false);
  });

  it('is finished once the clock is out', () => {
    expect(isFinished(tickCountdown(createCountdown(100), 100))).toBe(true);
  });

  it('rounds the readout up, so a part-second still shows as one second', () => {
    expect(secondsLeft({ remainingMs: 1 })).toBe(1);
    expect(secondsLeft({ remainingMs: 1_000 })).toBe(1);
    expect(secondsLeft({ remainingMs: 1_001 })).toBe(2);
  });

  it('shows zero only once the run is over', () => {
    expect(secondsLeft({ remainingMs: 0 })).toBe(0);
  });

  it('reports elapsed time as the mirror of what is left', () => {
    const state = tickCountdown(createCountdown(60_000), 12_500);
    expect(elapsed(state, 60_000)).toBe(12_500);
  });
});
