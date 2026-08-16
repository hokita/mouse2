import { describe, expect, it } from 'vitest';
import { createBite, strike, tickBite } from '../bite';
import type { BiteConfig, BiteEvent, BiteState } from '../bite';

const CONFIG: BiteConfig = {
  minWaitMs: 2000,
  maxWaitMs: 4000,
  nibbleMinGapMs: 500,
  nibbleMaxGapMs: 1000,
  nibbleQuietMs: 900,
  biteWindowMs: 700,
};

/** random() = 0.5 makes every roll land mid-range, so timings are exact. */
const mid = () => 0.5;

function tickUntil(state: BiteState, event: BiteEvent, stepMs: number, maxMs: number): { state: BiteState; atMs: number } | null {
  let elapsed = 0;
  while (elapsed < maxMs) {
    const result = tickBite(state, stepMs, CONFIG, mid);
    state = result.state;
    elapsed += stepMs;
    if (result.event === event) {
      return { state, atMs: elapsed };
    }
  }
  return null;
}

describe('createBite', () => {
  it('rolls the bite and first nibble inside their configured ranges', () => {
    const state = createBite(CONFIG, mid);
    expect(state.phase).toBe('waiting');
    expect(state.biteInMs).toBe(3000);
    expect(state.nibbleInMs).toBe(750);
    expect(state.windowLeftMs).toBe(CONFIG.biteWindowMs);
  });
});

describe('tickBite', () => {
  it('emits nibbles while waiting, then the bite', () => {
    let state = createBite(CONFIG, mid);
    const nibble = tickUntil(state, 'nibble', 50, 10_000);
    expect(nibble).not.toBeNull();
    expect(nibble!.atMs).toBe(750);

    const bite = tickUntil(nibble!.state, 'bite', 50, 10_000);
    expect(bite).not.toBeNull();
    expect(bite!.state.phase).toBe('bite');
  });

  it('never fires a nibble inside the quiet zone before the bite', () => {
    // Bite lands at 3000ms; nibbles at 750ms intervals would fire at 2250
    // and 3000 — the 2250 one is 750ms before the bite, inside the 900ms
    // quiet zone, so the run must go quiet after the nibble at 1500ms.
    let state = createBite(CONFIG, mid);
    const nibbleTimes: number[] = [];
    let elapsed = 0;
    while (state.phase === 'waiting' && elapsed < 10_000) {
      const result = tickBite(state, 50, CONFIG, mid);
      state = result.state;
      elapsed += 50;
      if (result.event === 'nibble') {
        nibbleTimes.push(elapsed);
      }
    }
    expect(state.phase).toBe('bite');
    for (const at of nibbleTimes) {
      expect(3000 - at).toBeGreaterThan(CONFIG.nibbleQuietMs);
    }
  });

  it('steals the bait when the window runs out', () => {
    let state: BiteState = { phase: 'bite', biteInMs: 0, nibbleInMs: 999, windowLeftMs: 100 };
    const result = tickBite(state, 150, CONFIG, mid);
    expect(result.event).toBe('stolen');
    expect(result.state.phase).toBe('stolen');
    // A stolen cast stays stolen — no further events.
    expect(tickBite(result.state, 1000, CONFIG, mid).event).toBe('none');
  });

  it('lets the bite win when nibble and bite land on the same tick', () => {
    const state: BiteState = { phase: 'waiting', biteInMs: 10, nibbleInMs: 10, windowLeftMs: 700 };
    expect(tickBite(state, 20, CONFIG, mid).event).toBe('bite');
  });
});

describe('strike', () => {
  it('scares the fish during the wait, hooks during the window, is late after', () => {
    expect(strike({ phase: 'waiting', biteInMs: 500, nibbleInMs: 100, windowLeftMs: 700 })).toBe('scared');
    expect(strike({ phase: 'bite', biteInMs: 0, nibbleInMs: 100, windowLeftMs: 300 })).toBe('hooked');
    expect(strike({ phase: 'stolen', biteInMs: 0, nibbleInMs: 100, windowLeftMs: 0 })).toBe('late');
  });
});
