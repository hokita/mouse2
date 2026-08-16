import { describe, expect, it } from 'vitest';
import { createTension, tickTension } from '../tension';
import type { TensionConfig, TensionState } from '../tension';

const CONFIG: TensionConfig = {
  reelPerSec: 0.25,
  slipPerSec: 0.1,
  risePerSec: 0.4,
  thrashRiseMult: 3,
  fallPerSec: 0.6,
  thrashMinGapMs: 1000,
  thrashMaxGapMs: 2000,
  thrashDurationMs: 500,
  escapeAfterSlackMs: 4000,
};

const mid = () => 0.5;

function fresh(): TensionState {
  return createTension(CONFIG, mid);
}

describe('createTension', () => {
  it('starts slack, calm, and unsettled', () => {
    const state = fresh();
    expect(state.progress).toBe(0);
    expect(state.tension).toBe(0);
    expect(state.thrashing).toBe(false);
    expect(state.thrashTimerMs).toBe(1500);
    expect(state.settled).toBe(false);
  });
});

describe('tickTension', () => {
  it('reels progress and builds tension while holding', () => {
    const { state } = tickTension(fresh(), 1000, true, CONFIG, mid);
    expect(state.progress).toBeCloseTo(0.25);
    expect(state.tension).toBeCloseTo(0.4);
  });

  it('slips progress and sheds tension while slack', () => {
    let state = tickTension(fresh(), 1000, true, CONFIG, mid).state;
    state = tickTension(state, 500, false, CONFIG, mid).state;
    expect(state.progress).toBeCloseTo(0.2);
    expect(state.tension).toBeCloseTo(0.1);
  });

  it('never slips progress or tension below zero', () => {
    const { state } = tickTension(fresh(), 3000, false, CONFIG, mid);
    expect(state.progress).toBe(0);
    expect(state.tension).toBe(0);
  });

  it('lets an abandoned fish work itself off the hook', () => {
    let state = fresh();
    // 3.9s of slack: still on. Another 200ms: gone.
    state = tickTension(state, 3900, false, CONFIG, mid).state;
    expect(state.settled).toBe(false);
    const result = tickTension(state, 200, false, CONFIG, mid);
    expect(result.events).toContain('escaped');
    expect(result.state.settled).toBe(true);
  });

  it('resets the slack clock the moment the player holds again', () => {
    let state = tickTension(fresh(), 3900, false, CONFIG, mid).state;
    state = tickTension(state, 100, true, CONFIG, mid).state;
    expect(state.slackMs).toBe(0);
    // The escape needs the full quiet spell over again.
    const result = tickTension(state, 3900, false, CONFIG, mid);
    expect(result.events).not.toContain('escaped');
  });

  it('starts and ends thrashes on schedule', () => {
    let state = fresh();
    // Gap rolled at 1500ms: crossing it starts the thrash...
    let result = tickTension(state, 1500, false, CONFIG, mid);
    expect(result.events).toContain('thrashStart');
    expect(result.state.thrashing).toBe(true);
    expect(result.state.thrashTimerMs).toBe(CONFIG.thrashDurationMs);
    // ...and its 500ms duration ends it.
    result = tickTension(result.state, 500, false, CONFIG, mid);
    expect(result.events).toContain('thrashEnd');
    expect(result.state.thrashing).toBe(false);
  });

  it('builds tension faster while the fish thrashes', () => {
    const calm = tickTension(fresh(), 500, true, CONFIG, mid).state;
    const thrashing = tickTension({ ...fresh(), thrashing: true, thrashTimerMs: 10_000 }, 500, true, CONFIG, mid).state;
    expect(calm.tension).toBeCloseTo(0.2);
    expect(thrashing.tension).toBeCloseTo(0.6);
  });

  it('lands the fish when progress fills', () => {
    const state = { ...fresh(), progress: 0.95 };
    const result = tickTension(state, 1000, true, CONFIG, mid);
    expect(result.events).toContain('landed');
    expect(result.state.settled).toBe(true);
    expect(result.state.progress).toBe(1);
    // Settled fights ignore further ticks.
    expect(tickTension(result.state, 1000, true, CONFIG, mid).events).toEqual([]);
  });

  it('snaps the line when tension fills', () => {
    const state = { ...fresh(), tension: 0.9 };
    const result = tickTension(state, 1000, true, CONFIG, mid);
    expect(result.events).toContain('snapped');
    expect(result.state.settled).toBe(true);
    expect(result.state.tension).toBe(1);
  });

  it('prefers the land when both lines are crossed in one tick', () => {
    const state = { ...fresh(), progress: 0.99, tension: 0.99 };
    const result = tickTension(state, 5000, true, CONFIG, mid);
    expect(result.events).toContain('landed');
    expect(result.events).not.toContain('snapped');
  });
});
