import { shuffled } from './rng';
import type { Rng } from './rng';

// Who acts, in what order, this round.
//
// Rebuilt from scratch every round rather than kept as a running queue. That
// costs nothing and buys two things: a speed change mid-fight takes effect
// immediately, and a combatant that fell this round simply is not in next
// round's list — no stale entries to skip over.

export interface TurnActor {
  id: string;
  spd: number;
  alive: boolean;
}

/**
 * Fastest first, ties broken at random.
 *
 * The shuffle before the sort is what randomises ties: Array.prototype.sort
 * is stable, so equal speeds keep whatever order they arrived in, and without
 * the shuffle two combatants of identical speed would have a fixed pecking
 * order decided by their position in the party array — invisible on screen
 * and impossible to reason about.
 */
export function buildTurnOrder(actors: readonly TurnActor[], rng: Rng): string[] {
  return shuffled(rng, actors.filter((a) => a.alive))
    .sort((a, b) => b.spd - a.spd)
    .map((a) => a.id);
}
