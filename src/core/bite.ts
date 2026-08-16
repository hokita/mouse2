// Big Bite's waiting game: after a cast, this decides when the bobber
// nibbles, when the real bite comes, and how long the strike window stays
// open. Pure and dt-driven, like the rest of core/ — the scene owns nothing
// but the pictures.

export interface BiteConfig {
  /** How long the fish takes to commit, rolled once per cast. */
  minWaitMs: number;
  maxWaitMs: number;
  /** Gap between two fake nibbles while waiting. */
  nibbleMinGapMs: number;
  nibbleMaxGapMs: number;
  /**
   * No nibble fires within this long of the real bite. A fake twitch half a
   * second before the plunge reads as the game baiting an error it then
   * punishes — the fakes are only fair with clear air around the real thing.
   */
  nibbleQuietMs: number;
  /** How long the strike window stays open once the bobber goes under. */
  biteWindowMs: number;
}

export type BitePhase = 'waiting' | 'bite' | 'stolen';

export interface BiteState {
  phase: BitePhase;
  /** Time left until the real bite. */
  biteInMs: number;
  /** Time left until the next fake nibble. */
  nibbleInMs: number;
  /** Time left in the strike window once phase is 'bite'. */
  windowLeftMs: number;
}

/** What one tick observed. At most one thing happens per tick; when the
 * nibble and bite timers land on the same frame, the bite wins — it is the
 * one the player must not miss. */
export type BiteEvent = 'none' | 'nibble' | 'bite' | 'stolen';

/** What a strike (a tap) means in each phase. */
export type StrikeOutcome = 'scared' | 'hooked' | 'late';

function between(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}

export function createBite(config: BiteConfig, random: () => number = Math.random): BiteState {
  return {
    phase: 'waiting',
    biteInMs: between(config.minWaitMs, config.maxWaitMs, random),
    nibbleInMs: between(config.nibbleMinGapMs, config.nibbleMaxGapMs, random),
    windowLeftMs: config.biteWindowMs,
  };
}

export function tickBite(
  state: BiteState,
  dt: number,
  config: BiteConfig,
  random: () => number = Math.random
): { state: BiteState; event: BiteEvent } {
  if (state.phase === 'stolen') {
    return { state, event: 'none' };
  }

  if (state.phase === 'bite') {
    const windowLeftMs = state.windowLeftMs - dt;
    if (windowLeftMs <= 0) {
      return { state: { ...state, phase: 'stolen', windowLeftMs: 0 }, event: 'stolen' };
    }
    return { state: { ...state, windowLeftMs }, event: 'none' };
  }

  const biteInMs = state.biteInMs - dt;
  if (biteInMs <= 0) {
    return { state: { ...state, phase: 'bite', biteInMs: 0 }, event: 'bite' };
  }

  let nibbleInMs = state.nibbleInMs - dt;
  if (nibbleInMs <= 0) {
    const gap = between(config.nibbleMinGapMs, config.nibbleMaxGapMs, random);
    if (biteInMs <= config.nibbleQuietMs) {
      // Inside the quiet zone: swallow the nibble and push the timer past
      // the bite, which will fire first and make the timer moot.
      return { state: { ...state, biteInMs, nibbleInMs: biteInMs + gap }, event: 'none' };
    }
    return { state: { ...state, biteInMs, nibbleInMs: gap }, event: 'nibble' };
  }

  return { state: { ...state, biteInMs, nibbleInMs }, event: 'none' };
}

/**
 * The player tapped. During the wait — nibble or no nibble — that scares the
 * fish off; the whole skill is holding still until the bobber truly goes
 * under. During the window it hooks. After the window it is just late.
 */
export function strike(state: BiteState): StrikeOutcome {
  if (state.phase === 'waiting') {
    return 'scared';
  }
  if (state.phase === 'bite') {
    return 'hooked';
  }
  return 'late';
}
