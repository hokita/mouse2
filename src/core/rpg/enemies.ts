import { randInt, pick, shuffled } from './rng';
import type { Rng } from './rng';
import type { Affinity } from './elements';
import type { SkillId } from './skills';
import type { Stats } from './stats';

// The bestiary. Nine monsters over four tiers, which is few enough that the
// player meets each one often enough to learn its colour.
//
// Every monster has a weakness. That is not flavour, it is the contract: the
// game asks one question per encounter — what colour is this? — and a monster
// with no answer is a monster with nothing to say. Resistances are optional
// and exist to punish spamming one bolt.
//
// No monster carries a move that targets its own side except the boss's
// self-heal, so the party never has to work out who a monster is pointing at.

export type EnemyShape = 'blob' | 'imp' | 'wisp' | 'crab' | 'shade' | 'golem' | 'wyrm' | 'drake' | 'crown';

/** 1-3 are the map's three tiers; 4 is the boss and appears once. */
export type Tier = 1 | 2 | 3 | 4;

export interface EnemyDef {
  id: EnemyId;
  /** Which silhouette to draw. Colour comes from the weakness, in the UI. */
  shape: EnemyShape;
  affinity: Affinity;
  stats: Stats;
  moves: SkillId[];
  exp: number;
  tier: Tier;
}

export type EnemyId =
  | 'blob'
  | 'imp'
  | 'wisp'
  | 'crab'
  | 'shade'
  | 'golem'
  | 'wyrm'
  | 'drake'
  | 'crown';

export const BOSS_ID = 'crown' as const;

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  // --- tier 1: one move each, so the first fights teach colour and nothing else
  blob: {
    id: 'blob',
    shape: 'blob',
    affinity: { weak: 'fire' },
    stats: { maxHp: 34, maxMp: 0, atk: 12, mag: 6, def: 6, spd: 5 },
    moves: ['bite'],
    exp: 22,
    tier: 1,
  },
  imp: {
    id: 'imp',
    shape: 'imp',
    affinity: { weak: 'ice', resist: 'fire' },
    stats: { maxHp: 28, maxMp: 12, atk: 11, mag: 13, def: 5, spd: 11 },
    moves: ['bite', 'scorch'],
    exp: 26,
    tier: 1,
  },
  wisp: {
    id: 'wisp',
    shape: 'wisp',
    affinity: { weak: 'spark', resist: 'ice' },
    stats: { maxHp: 26, maxMp: 12, atk: 9, mag: 14, def: 4, spd: 13 },
    moves: ['bite', 'chill'],
    exp: 24,
    tier: 1,
  },

  // --- tier 2: a second move, and the first status effects
  crab: {
    id: 'crab',
    shape: 'crab',
    affinity: { weak: 'spark', resist: 'ice' },
    stats: { maxHp: 78, maxMp: 14, atk: 22, mag: 8, def: 20, spd: 7 },
    moves: ['bite', 'gnash'],
    exp: 58,
    tier: 2,
  },
  shade: {
    id: 'shade',
    shape: 'shade',
    affinity: { weak: 'fire', resist: 'spark' },
    stats: { maxHp: 62, maxMp: 20, atk: 18, mag: 20, def: 11, spd: 15 },
    moves: ['bite', 'spit', 'lullaby'],
    exp: 64,
    tier: 2,
  },
  golem: {
    id: 'golem',
    shape: 'golem',
    affinity: { weak: 'ice', resist: 'fire' },
    stats: { maxHp: 92, maxMp: 14, atk: 24, mag: 6, def: 24, spd: 4 },
    moves: ['bite', 'wither'],
    exp: 68,
    tier: 2,
  },

  // --- tier 3: hits everyone, and hurts
  wyrm: {
    id: 'wyrm',
    shape: 'wyrm',
    affinity: { weak: 'ice', resist: 'fire' },
    stats: { maxHp: 150, maxMp: 26, atk: 34, mag: 30, def: 26, spd: 12 },
    moves: ['bite', 'scorch', 'gnash'],
    exp: 128,
    tier: 3,
  },
  drake: {
    id: 'drake',
    shape: 'drake',
    affinity: { weak: 'spark', resist: 'ice' },
    stats: { maxHp: 165, maxMp: 30, atk: 38, mag: 28, def: 28, spd: 14 },
    moves: ['bite', 'chill', 'roar'],
    exp: 136,
    tier: 3,
  },

  // --- tier 4: the boss
  // It keeps a weakness like everything else. A boss that answered the game's
  // one question with "none of the above" would spend the last fight teaching
  // the player that the thing they learned all run does not apply.
  crown: {
    id: 'crown',
    shape: 'crown',
    affinity: { weak: 'spark', resist: 'fire' },
    stats: { maxHp: 460, maxMp: 60, atk: 46, mag: 42, def: 32, spd: 13 },
    moves: ['ruin', 'roar', 'wither', 'knit'],
    exp: 320,
    tier: 4,
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];

export function isElite(nodeKind: string): boolean {
  return nodeKind === 'elite';
}

/**
 * Rolls the crowd for one fight.
 *
 * Capped at three. A fourth silhouette does not fit across 430px next to its
 * own HP bar, and a fight the player cannot see is not a fight they can plan.
 */
export function encounterFor(tier: Tier, elite: boolean, rng: Rng): EnemyId[] {
  if (tier === 4) {
    return [BOSS_ID];
  }

  const pool = ENEMY_IDS.filter((id) => ENEMIES[id].tier === tier);
  const size = elite ? randInt(rng, 2, 3) : randInt(rng, 1, 2);

  // Draw distinct species first: two different silhouettes read as a tactical
  // choice, two identical ones read as a rendering mistake. Only repeat once
  // the pool runs dry.
  const distinct = shuffled(rng, pool).slice(0, size);
  while (distinct.length < size) {
    distinct.push(pick(rng, pool));
  }
  return distinct;
}
