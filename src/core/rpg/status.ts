// Status effects: the second thing the game says without words.
//
// Each one is a pip orbiting a portrait, so the set is kept small and each
// member has to be legible from its behaviour alone — a player who never
// learns the pip's name should still learn what it does by watching it.
//
// Durations are in turns of the afflicted combatant, counted down at the end
// of its own turn. That is the only timing that reads honestly on screen: a
// pip that vanished during someone else's turn would look like a bug.

// Three, and all three are things done TO you. Nothing in the game blesses
// any more: the party carries no status magic at all, so a pip orbiting a
// portrait is always bad news and never has to be read twice.
export type StatusKind = 'poison' | 'sleep' | 'atkDown';

export interface Status {
  kind: StatusKind;
  /** Turns remaining, counted down at the end of the bearer's turn. */
  turns: number;
}

/** Poison scales off maximum HP, so it stays relevant as levels climb. */
export const POISON_FRACTION = 0.08;
export const ATK_DOWN_MULT = 0.6;

export function hasStatus(statuses: readonly Status[], kind: StatusKind): boolean {
  return statuses.some((status) => status.kind === kind);
}

/**
 * Adds `kind`, or refreshes it to whichever duration is longer.
 *
 * Never stacks. Two poisons at once would double the bleed while showing one
 * pip — a hidden number in a game whose whole premise is that everything on
 * screen can be seen.
 */
export function applyStatus(statuses: readonly Status[], kind: StatusKind, turns: number): Status[] {
  const existing = statuses.find((status) => status.kind === kind);
  if (!existing) {
    return [...statuses, { kind, turns }];
  }
  return statuses.map((status) =>
    status.kind === kind ? { kind, turns: Math.max(status.turns, turns) } : status
  );
}

export function attackMultiplier(statuses: readonly Status[]): number {
  return hasStatus(statuses, 'atkDown') ? ATK_DOWN_MULT : 1;
}

/** Damage always wakes a sleeper — otherwise sleep is a stun, and unfair. */
export function wakeOnDamage(statuses: readonly Status[]): Status[] {
  if (!hasStatus(statuses, 'sleep')) {
    return [...statuses];
  }
  return statuses.filter((status) => status.kind !== 'sleep');
}

export interface TurnEndResult {
  statuses: Status[];
  /** Only ever negative now — poison bleeds, and nothing here mends. */
  hpDelta: number;
  expired: StatusKind[];
}

/** Runs poison, counts every pip down one turn, and drops the ones that ran out. */
export function resolveTurnEnd(statuses: readonly Status[], maxHp: number): TurnEndResult {
  let hpDelta = 0;
  if (hasStatus(statuses, 'poison')) {
    // At least one point: on a low-level character a rounded 8% is zero, and
    // a pip that takes nothing is a pip that lies.
    hpDelta -= Math.max(1, Math.round(maxHp * POISON_FRACTION));
  }

  const expired: StatusKind[] = [];
  const remaining: Status[] = [];
  for (const status of statuses) {
    const turns = status.turns - 1;
    if (turns <= 0) {
      expired.push(status.kind);
    } else {
      remaining.push({ kind: status.kind, turns });
    }
  }

  return { statuses: remaining, hpDelta, expired };
}
