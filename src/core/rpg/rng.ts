// A seeded pseudo-random source, so a battle can be replayed exactly.
//
// The arcade games here are happy with Math.random: a run is short, and if a
// shard spawns a lane to the left nobody can tell. A turn-based game cannot
// be checked that way — "is this fight winnable, and does it ever end?" is a
// question about thousands of fights, and it can only be asked if a seed
// reproduces one. Every rule below this line draws from an Rng, never from
// Math.random, so the balance simulation in the tests is deterministic.

/** Returns a number in [0, 1). Stateful: each call advances the stream. */
export type Rng = () => number;

/**
 * mulberry32 — 32 bits of state, one multiply-xorshift round per draw.
 *
 * Chosen over a bare `Math.sin(seed++)` hash because that one visibly
 * correlates between neighbouring seeds, and map generation seeds runs from a
 * counter. Its period (2^32) is far beyond anything one run draws.
 */
export function createRng(seed: number): Rng {
  // Keep the state in a 32-bit lane and away from 0, which would otherwise
  // make the first few draws suspiciously small.
  let state = (seed >>> 0) + 0x6d2b79f5;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] — both ends included, the way a die is read. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, options: readonly T[]): T {
  return options[Math.floor(rng() * options.length)];
}

/**
 * True with probability `p`.
 *
 * The comparison is `rng() < p` rather than `<=` so that p = 0 can never
 * fire; p = 1 always does, because rng() never reaches 1.
 */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Fisher-Yates on a copy — the caller's array is never touched. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
