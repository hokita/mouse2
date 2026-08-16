// What is on the end of the line. Rolled per cast, unseen until hooked —
// the reveal is half the fun — with the odds drifting toward the big ones as
// the run goes on, so the last casts carry the most weight.

export type CatchRarity = 'common' | 'fine' | 'big' | 'golden';

export const CATCH_POINTS: Record<CatchRarity, number> = {
  common: 10,
  fine: 20,
  big: 30,
  golden: 50,
};

/** Draw order for the roll, smallest first. */
export const RARITIES: CatchRarity[] = ['common', 'fine', 'big', 'golden'];

/** Odds at the first cast and at the last, lerped between. */
const START_WEIGHTS: Record<CatchRarity, number> = { common: 58, fine: 26, big: 12, golden: 4 };
const END_WEIGHTS: Record<CatchRarity, number> = { common: 22, fine: 30, big: 30, golden: 18 };

/**
 * How far through the run cast `castIndex` of `castCount` is, 0–1. A single
 * cast counts as the end of the run, not the start — one cast should get the
 * good odds, not the opening ones.
 */
export function castProgress(castIndex: number, castCount: number): number {
  if (castCount <= 1) {
    return 1;
  }
  return Math.min(1, Math.max(0, castIndex / (castCount - 1)));
}

export function catchWeight(rarity: CatchRarity, t: number): number {
  return START_WEIGHTS[rarity] + (END_WEIGHTS[rarity] - START_WEIGHTS[rarity]) * t;
}

/** Rolls what bites on this cast. */
export function pickCatch(
  castIndex: number,
  castCount: number,
  random: () => number = Math.random
): CatchRarity {
  const t = castProgress(castIndex, castCount);
  const total = RARITIES.reduce((sum, rarity) => sum + catchWeight(rarity, t), 0);
  let roll = random() * total;
  for (const rarity of RARITIES) {
    roll -= catchWeight(rarity, t);
    if (roll < 0) {
      return rarity;
    }
  }
  // random() is documented as [0, 1), but a stubbed or rounding-edge 1 must
  // still land on a real rarity.
  return RARITIES[RARITIES.length - 1];
}
