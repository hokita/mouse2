// Stat blocks and the level curve.
//
// Six numbers per combatant, which is as few as a turn-based game can get
// away with and still let three party members feel different: the father
// swings atk, the mother swings mag, the daughter goes first on spd.
//
// None of these six are ever printed. HP and MP are a bar and a row of pips;
// atk, mag, def and spd only ever surface as the size of a damage number.
// That is the point — the player reads outcomes, not a stat screen.

export interface Stats {
  maxHp: number;
  maxMp: number;
  /** Drives physical damage. */
  atk: number;
  /** Drives elemental damage and healing. */
  mag: number;
  /** Blunts both. One defence rather than two, so a wrong guess is never
   *  punished by a distinction the screen has no room to explain. */
  def: number;
  /** Turn order, and nothing else. */
  spd: number;
}

export const MAX_LEVEL = 12;

/** Linear growth: base at level 1, plus one growth block per level after. */
export function statsAtLevel(base: Stats, growth: Stats, level: number): Stats {
  const gained = Math.max(0, level - 1);
  return {
    maxHp: base.maxHp + growth.maxHp * gained,
    maxMp: base.maxMp + growth.maxMp * gained,
    atk: base.atk + growth.atk * gained,
    mag: base.mag + growth.mag * gained,
    def: base.def + growth.def * gained,
    spd: base.spd + growth.spd * gained,
  };
}

/**
 * Total EXP banked to *be* level `level`.
 *
 * Quadratic, so the early levels arrive fast enough to teach the player that
 * levelling exists and the late ones are worth routing the map for. Tuned
 * against a full run's income — roughly 1500 EXP over 15-20 fights — to land
 * a finished campaign somewhere around level 10 or 11 rather than at the cap.
 */
export function expToReach(level: number): number {
  const gained = Math.max(0, Math.min(level, MAX_LEVEL) - 1);
  return 12 * gained * gained + 8 * gained;
}

export function levelForExp(exp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expToReach(level + 1)) {
    level += 1;
  }
  return level;
}
