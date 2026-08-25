import { randInt, pick, shuffled } from './rng';
import type { Rng } from './rng';
import { affinityOf } from './elements';
import type { Affinity, CastableElement, Element } from './elements';
import type { SkillId } from './skills';
import type { Stats } from './stats';

// The bestiary. Nine monsters over four tiers, which is few enough that the
// player meets each one often enough to learn its colour.
//
// Every monster declares one thing — the colour it *is* — and everything else
// about how it takes a hit falls out of the triangle in `elements.ts`. That
// is the contract: the game asks one question per encounter, *what beats
// this*, and the player answers it by reading the badge in the corner rather
// than by remembering nine separate rules.
//
// Affinities are derived rather than written down. They used to be typed out
// per monster, which meant the bestiary could disagree with the diagram on
// screen — and with no words anywhere, a diagram the game does not obey is
// unfalsifiable to the player and simply teaches them the wrong thing.
//
// No monster carries a move that targets its own side except the boss's
// self-heal, so the party never has to work out who a monster is pointing at.

export type EnemyShape = 'blob' | 'imp' | 'wisp' | 'crab' | 'shade' | 'golem' | 'wyrm' | 'drake' | 'crown';

/** 1-3 are the map's three tiers; 4 is the boss and appears once. */
export type Tier = 1 | 2 | 3 | 4;

export interface EnemyDef {
  id: EnemyId;
  /** Which silhouette to draw. The UI paints it in `element`'s colour. */
  shape: EnemyShape;
  /** The colour this thing *is* — the one fact each monster states itself. */
  element: CastableElement;
  /** Derived from `element`. Never write one of these by hand. */
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

/**
 * Builds one entry, with its affinity read off the triangle.
 *
 * The only way to make an `EnemyDef`. There is no route here that lets a
 * monster disagree with the diagram the player is looking at.
 */
function monster(def: Omit<EnemyDef, 'affinity'>): EnemyDef {
  return { ...def, affinity: affinityOf(def.element) };
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  // --- tier 1: one move each, so the first fights teach colour and nothing else
  blob: monster({
    id: 'blob',
    shape: 'blob',
    element: 'leaf',
    stats: { maxHp: 34, maxMp: 0, atk: 12, mag: 6, def: 6, spd: 5 },
    moves: ['bite'],
    exp: 40,
    tier: 1,
  }),
  imp: monster({
    id: 'imp',
    shape: 'imp',
    element: 'fire',
    stats: { maxHp: 28, maxMp: 12, atk: 11, mag: 13, def: 5, spd: 11 },
    moves: ['bite', 'scorch'],
    exp: 46,
    tier: 1,
  }),
  wisp: monster({
    id: 'wisp',
    shape: 'wisp',
    element: 'water',
    stats: { maxHp: 26, maxMp: 12, atk: 9, mag: 14, def: 4, spd: 13 },
    moves: ['bite', 'drench'],
    exp: 42,
    tier: 1,
  }),

  // --- tier 2: a second move, and the first status effects
  crab: monster({
    id: 'crab',
    shape: 'crab',
    element: 'water',
    stats: { maxHp: 78, maxMp: 14, atk: 22, mag: 8, def: 15, spd: 7 },
    moves: ['bite', 'gnash'],
    exp: 105,
    tier: 2,
  }),
  shade: monster({
    id: 'shade',
    shape: 'shade',
    element: 'leaf',
    stats: { maxHp: 62, maxMp: 20, atk: 18, mag: 20, def: 11, spd: 15 },
    moves: ['bite', 'spit', 'lullaby'],
    exp: 115,
    tier: 2,
  }),
  golem: monster({
    id: 'golem',
    shape: 'golem',
    element: 'fire',
    stats: { maxHp: 92, maxMp: 14, atk: 24, mag: 6, def: 18, spd: 4 },
    moves: ['bite', 'wither'],
    exp: 120,
    tier: 2,
  }),

  // --- tier 3: hits everyone, and hurts
  wyrm: monster({
    id: 'wyrm',
    shape: 'wyrm',
    element: 'fire',
    stats: { maxHp: 150, maxMp: 26, atk: 32, mag: 28, def: 20, spd: 12 },
    moves: ['bite', 'scorch', 'gnash'],
    exp: 225,
    tier: 3,
  }),
  drake: monster({
    id: 'drake',
    shape: 'drake',
    element: 'water',
    stats: { maxHp: 165, maxMp: 30, atk: 35, mag: 26, def: 22, spd: 14 },
    moves: ['bite', 'drench', 'roar'],
    exp: 240,
    tier: 3,
  }),

  // --- tier 4: the boss
  // It wears a colour like everything else. A boss that answered the game's
  // one question with "none of the above" would spend the last fight teaching
  // the player that the thing they learned all run does not apply.
  crown: monster({
    id: 'crown',
    shape: 'crown',
    element: 'water',
    stats: { maxHp: 460, maxMp: 60, atk: 42, mag: 38, def: 26, spd: 13 },
    moves: ['ruin', 'roar', 'wither', 'knit'],
    exp: 420,
    tier: 4,
  }),
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
export function encounterFor(
  tier: Tier,
  elite: boolean,
  rng: Rng,
  answerable?: readonly Element[]
): EnemyId[] {
  if (tier === 4) {
    return [BOSS_ID];
  }

  let pool = ENEMY_IDS.filter((id) => ENEMIES[id].tier === tier);

  // `answerable` narrows the draw to monsters the party can actually answer.
  // Only the opening fight passes it, and it matters there more than anywhere
  // else. The Wizard starts with water alone and is the only hero carrying a
  // colour at all, so a blob — which is leaf, and drinks water — would meet
  // the party's one bolt with a number half the size of a plain swing. The
  // single fight whose whole job is to teach the player to read the triangle
  // would have taught them that reading it does not pay.
  if (answerable) {
    const covered = pool.filter((id) => {
      const weak = ENEMIES[id].affinity.weak;
      return weak !== undefined && answerable.includes(weak);
    });
    if (covered.length > 0) {
      pool = covered;
    }
  }
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
