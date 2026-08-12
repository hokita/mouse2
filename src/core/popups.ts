import { freeLanes } from './lanes';

/** What can surface out of a hole. */
export type PopupKind = 'fish' | 'rare' | 'trash';

export interface KindOdds {
  /** Chance the next pop-up is the rare fish, 0–1. */
  rare: number;
  /** Chance it is a piece of trash, 0–1. */
  trash: number;
}

/** What catching each kind is worth. Trash is the only way to lose points. */
export const POINTS: Record<PopupKind, number> = {
  fish: 10,
  rare: 30,
  trash: -15,
};

/**
 * One roll decides the kind, so the odds share a single 0–1 line: rare takes
 * the bottom slice, trash the next, and an ordinary fish everything left over.
 * Rolling twice would let both slices grow past 100% between them and quietly
 * starve the ordinary fish out of the game.
 */
export function pickKind(odds: KindOdds, random: () => number = Math.random): PopupKind {
  const roll = random();
  if (roll < odds.rare) {
    return 'rare';
  }
  if (roll < odds.rare + odds.trash) {
    return 'trash';
  }
  return 'fish';
}

/**
 * Picks a hole with nothing in it, or null when every hole is busy — two
 * things surfacing from the same hole would overlap into one unhittable
 * tangle. `occupied` is reused from the road games' lane bookkeeping: a grid
 * of holes and a row of lanes are the same "which slots are taken" question.
 */
export function pickFreeHole(
  occupied: readonly number[],
  holeCount: number,
  random: () => number = Math.random
): number | null {
  const free = freeLanes(occupied, holeCount);
  if (free.length === 0) {
    return null;
  }
  // random() is documented as [0, 1), but clamp anyway so a stubbed or
  // rounding-edge 1 can't index past the end of the array.
  const index = Math.min(free.length - 1, Math.floor(random() * free.length));
  return free[index];
}
