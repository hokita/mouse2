import { describe, expect, it } from 'vitest';
import { simulateRun } from './simulate';
import { MAX_LEVEL } from '../stats';

// The safety net a turn-based game needs and an arcade game does not.
//
// Dodger can be balanced by playing it for a minute. A fifteen-fight campaign
// cannot: the question "is the boss beatable at the level this map hands you"
// depends on every EXP number, every growth curve and every damage multiplier
// at once, and no amount of playing it by hand covers the spread of maps the
// generator can produce. So the rules get driven headlessly instead.

const RUNS = 200;
const outcomes = (policy: 'skilled' | 'naive') =>
  Array.from({ length: RUNS }, (_, seed) => simulateRun(seed, policy));

const skilled = outcomes('skilled');
const naive = outcomes('naive');
const rate = (results: ReturnType<typeof simulateRun>[]) =>
  results.filter((r) => r.won).length / results.length;

describe('every fight ends', () => {
  it('never stalls, across two hundred whole campaigns', () => {
    // The one result that would be a real bug rather than a tuning problem:
    // a fight both sides can survive forever leaves the player tapping a
    // menu with no way out and no message explaining why.
    expect(skilled.filter((r) => r.stalemate)).toEqual([]);
    expect(naive.filter((r) => r.stalemate)).toEqual([]);
  });

  it('resolves fights in a length a person would sit through', () => {
    const longest = Math.max(...skilled.map((r) => r.longestFight));
    expect(longest).toBeLessThan(120);
  });
});

describe('the campaign is winnable, and not a formality', () => {
  it('is won often enough to be worth starting', () => {
    expect(rate(skilled)).toBeGreaterThan(0.25);
  });

  it('is lost often enough that winning means something', () => {
    expect(rate(skilled)).toBeLessThan(0.95);
  });

  it('goes the distance when it goes well', () => {
    const wins = skilled.filter((r) => r.won);
    const avgFights = wins.reduce((sum, r) => sum + r.fights, 0) / wins.length;
    expect(avgFights).toBeGreaterThan(5);
  });

  it('leaves a finished party near the top of the level curve', () => {
    // Winners average about 11.5 of a possible 12, so most of them do cap out
    // on the last fight or two. The upper guard is therefore not the average
    // - with a cap of 12 that average can never exceed it, so the assertion
    // would hold however much EXP was handed out. What actually catches
    // runaway income is that some winners still finish short of the cap.
    const wins = skilled.filter((r) => r.won);
    const avgLevel = wins.reduce((sum, r) => sum + r.level, 0) / wins.length;
    expect(avgLevel).toBeGreaterThan(9);
    expect(wins.some((r) => r.level < MAX_LEVEL)).toBe(true);
  });
});

describe('reading the colours is the game', () => {
  it('rewards a player who hits weaknesses far more than one who only swings', () => {
    // If this margin ever collapsed, the elemental system - and with it the
    // only thing this game teaches without words - would be decoration.
    expect(rate(skilled)).toBeGreaterThan(rate(naive) + 0.2);
  });
});
