// Big Bite's fight: hold to reel, ease off when the fish thrashes. Progress
// and tension both live on a 0–1 line — progress full lands the fish, tension
// full snaps the line. Pure and dt-driven; the scene supplies only `holding`.

export interface TensionConfig {
  /** Progress gained per second while holding. */
  reelPerSec: number;
  /** Progress lost per second while slack — the fish swims for it. */
  slipPerSec: number;
  /** Tension gained per second while holding, between thrashes. */
  risePerSec: number;
  /** How much faster tension climbs while the fish thrashes. */
  thrashRiseMult: number;
  /** Tension shed per second while slack. */
  fallPerSec: number;
  /** Gap between two thrashes, and how long each one lasts. */
  thrashMinGapMs: number;
  thrashMaxGapMs: number;
  thrashDurationMs: number;
  /**
   * Slack held continuously this long lets the fish work itself off the
   * hook. Without it a player who freezes mid-fight is simply stuck: the
   * fight has no clock of its own, so an abandoned line must end the cast.
   */
  escapeAfterSlackMs: number;
}

export interface TensionState {
  /** 0–1; full lands the fish. */
  progress: number;
  /** 0–1; full snaps the line. */
  tension: number;
  thrashing: boolean;
  /** Time until the next thrash begins, or until this one ends. */
  thrashTimerMs: number;
  /** How long the line has been continuously slack. */
  slackMs: number;
  /** Set once the fight ended; a settled fight ignores further ticks. */
  settled: boolean;
}

export type TensionEvent = 'thrashStart' | 'thrashEnd' | 'landed' | 'snapped' | 'escaped';

function between(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}

export function createTension(config: TensionConfig, random: () => number = Math.random): TensionState {
  return {
    progress: 0,
    tension: 0,
    thrashing: false,
    thrashTimerMs: between(config.thrashMinGapMs, config.thrashMaxGapMs, random),
    slackMs: 0,
    settled: false,
  };
}

/**
 * Advances the fight. Events arrive in the order they happened within the
 * tick; `landed` and `snapped` are terminal, and on the tick both lines are
 * crossed at once the land wins — the fish was already out of the water.
 */
export function tickTension(
  state: TensionState,
  dt: number,
  holding: boolean,
  config: TensionConfig,
  random: () => number = Math.random
): { state: TensionState; events: TensionEvent[] } {
  if (state.settled) {
    return { state, events: [] };
  }

  const events: TensionEvent[] = [];
  let { thrashing, thrashTimerMs } = state;

  thrashTimerMs -= dt;
  if (thrashTimerMs <= 0) {
    thrashing = !thrashing;
    thrashTimerMs = thrashing
      ? config.thrashDurationMs
      : between(config.thrashMinGapMs, config.thrashMaxGapMs, random);
    events.push(thrashing ? 'thrashStart' : 'thrashEnd');
  }

  const seconds = dt / 1000;
  let progress = state.progress;
  let tension = state.tension;
  let slackMs = state.slackMs;
  if (holding) {
    slackMs = 0;
    progress += config.reelPerSec * seconds;
    tension += config.risePerSec * (thrashing ? config.thrashRiseMult : 1) * seconds;
  } else {
    slackMs += dt;
    progress = Math.max(0, progress - config.slipPerSec * seconds);
    tension = Math.max(0, tension - config.fallPerSec * seconds);
  }

  if (progress >= 1) {
    events.push('landed');
    return {
      state: { progress: 1, tension, thrashing, thrashTimerMs, slackMs, settled: true },
      events,
    };
  }
  if (tension >= 1) {
    events.push('snapped');
    return {
      state: { progress, tension: 1, thrashing, thrashTimerMs, slackMs, settled: true },
      events,
    };
  }
  if (slackMs >= config.escapeAfterSlackMs) {
    events.push('escaped');
    return {
      state: { progress, tension, thrashing, thrashTimerMs, slackMs, settled: true },
      events,
    };
  }

  return { state: { progress, tension, thrashing, thrashTimerMs, slackMs, settled: false }, events };
}
