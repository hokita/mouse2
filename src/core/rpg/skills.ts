import type { Element } from './elements';
import type { StatusKind } from './status';

// Every action anyone can take, heroes and monsters from the same table.
//
// One table rather than two because the resolver in battle.ts should not care
// who swung: a hero's fire bolt and a salamander's scorch are the same event
// with different owners, and giving them separate shapes would mean two code
// paths that must be kept in step for the rest of the game's life.
//
// TARGETS ARE ACTOR-RELATIVE. 'oneFoe' means the other side, whichever side
// that is. This is what lets the table be shared.

export type TargetShape = 'oneFoe' | 'allFoes' | 'oneAlly' | 'allAllies' | 'self';

/**
 * How heavily a skill lands. The party's whole tray is this axis crossed with
 * one other: the father swings it in muscle, the mother in three colours, the
 * daughter in no colour at all and in healing.
 *
 * Three weights and no more. A player who has worked out what `strong` costs
 * in fire has worked it out in water and leaf too, which is the only way a
 * seventeen-skill tray stays readable with no text on it.
 */
export type SkillTier = 'normal' | 'strong' | 'spread';

export const TIERS = ['normal', 'strong', 'spread'] as const satisfies readonly SkillTier[];

/**
 * What the icon looks like. The wordless grammar is three-part and strict:
 *
 *   SHAPE says what the skill does. WEIGHT says how hard. COLOUR says which
 *   element it is.
 *
 * So `torrent` and `flare` share the `burst` shape and differ only in tint,
 * `deluge` is that same burst drawn heavier, and the player learns one shape
 * once instead of nine names never.
 */
export type SkillGlyph =
  | 'blade' // a single hit
  | 'greatblade' // the same swing, doubled
  | 'fan' // a sweep across everyone
  | 'burst' // a bolt at one target
  | 'starburst' // the same bolt, doubled
  | 'wave' // a bolt at everyone
  | 'drop' // mends one
  | 'bloom' // mends everyone
  | 'skull' // poison
  | 'moon' // sleep
  | 'down'; // weakens

export type SkillKind = 'strike' | 'heal' | 'afflict';

export interface Inflict {
  status: StatusKind;
  turns: number;
  /** 0-1. Nothing lands for certain, so a bad turn is never purely bad luck. */
  chance: number;
}

export interface Skill {
  id: SkillId;
  glyph: SkillGlyph;
  tier: SkillTier;
  mpCost: number;
  element: Element;
  /** 100 is a plain swing. 0 means the skill does no damage or healing at all. */
  power: number;
  /**
   * Which stat the skill swings.
   *
   * Stated rather than inferred, because colour does not decide it and
   * neither does its absence. Everything the father throws is `plain` and
   * runs on `atk`; everything the daughter throws is `plain` too and runs on
   * `mag`. Guessing from the element would hand one of them a kit powered by
   * their worst number.
   */
  stat: 'atk' | 'mag';
  target: TargetShape;
  kind: SkillKind;
  inflicts?: Inflict;
}

export type SkillId =
  // Warrior
  | 'hew'
  | 'crush'
  | 'cleave'
  // Wizard: three colours by three weights
  | 'flare'
  | 'blaze'
  | 'wildfire'
  | 'torrent'
  | 'deluge'
  | 'flood'
  | 'thorn'
  | 'bramble'
  | 'thicket'
  // Hero
  | 'force'
  | 'nova'
  | 'pulse'
  | 'mend'
  | 'chorus'
  // shared
  | 'strike'
  // monsters
  | 'bite'
  | 'gnash'
  | 'spit'
  | 'drench'
  | 'scorch'
  | 'sting'
  | 'lullaby'
  | 'wither'
  | 'roar'
  | 'ruin'
  | 'knit';

export const SKILLS: Record<SkillId, Skill> = {
  // --- Warrior: a body in the way, and not one spark of colour -----------
  // He used to swing a burning sword. It was taken off him so that colour
  // could belong to exactly one person: with the mother holding all three
  // bolts and nobody else holding any, "who do I ask about that monster?"
  // has one answer, and the triangle in the corner has one owner.
  //
  // What is left is the ruler: three weights of plain damage that never bend,
  // and therefore the numbers every coloured one is read against.
  hew: { id: 'hew', glyph: 'blade', tier: 'normal', mpCost: 4, element: 'plain', power: 145, stat: 'atk', target: 'oneFoe', kind: 'strike' },
  crush: { id: 'crush', glyph: 'greatblade', tier: 'strong', mpCost: 8, element: 'plain', power: 210, stat: 'atk', target: 'oneFoe', kind: 'strike' },
  cleave: { id: 'cleave', glyph: 'fan', tier: 'spread', mpCost: 6, element: 'plain', power: 80, stat: 'atk', target: 'allFoes', kind: 'strike' },

  // --- Wizard: the only source of all three colours ----------------------
  // Nine cells, and cost and power come from the column alone. The three
  // colours are priced identically on purpose: the bolts exist to make the
  // player answer one question every turn — what colour is that thing? — and
  // any difference in price would let them answer a cheaper question instead.
  flare: { id: 'flare', glyph: 'burst', tier: 'normal', mpCost: 4, element: 'fire', power: 150, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  blaze: { id: 'blaze', glyph: 'starburst', tier: 'strong', mpCost: 9, element: 'fire', power: 240, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  wildfire: { id: 'wildfire', glyph: 'wave', tier: 'spread', mpCost: 10, element: 'fire', power: 105, stat: 'mag', target: 'allFoes', kind: 'strike' },
  torrent: { id: 'torrent', glyph: 'burst', tier: 'normal', mpCost: 4, element: 'water', power: 150, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  deluge: { id: 'deluge', glyph: 'starburst', tier: 'strong', mpCost: 9, element: 'water', power: 240, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  flood: { id: 'flood', glyph: 'wave', tier: 'spread', mpCost: 10, element: 'water', power: 105, stat: 'mag', target: 'allFoes', kind: 'strike' },
  thorn: { id: 'thorn', glyph: 'burst', tier: 'normal', mpCost: 4, element: 'leaf', power: 150, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  bramble: { id: 'bramble', glyph: 'starburst', tier: 'strong', mpCost: 9, element: 'leaf', power: 240, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  thicket: { id: 'thicket', glyph: 'wave', tier: 'spread', mpCost: 10, element: 'leaf', power: 105, stat: 'mag', target: 'allFoes', kind: 'strike' },

  // --- Hero: untyped magic, and every heal in the game --------------------
  // Untyped, and that is the entire point. The mother's bolts swing between
  // 1.75x and 0.5x on whether the player read the colour right; these three
  // never move. So the daughter is what a player reaches for when they cannot
  // tell what they are looking at, and the price of that certainty is a
  // ceiling: at every weight, a matched bolt of the mother's beats hers.
  force: { id: 'force', glyph: 'burst', tier: 'normal', mpCost: 5, element: 'plain', power: 190, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  nova: { id: 'nova', glyph: 'starburst', tier: 'strong', mpCost: 10, element: 'plain', power: 300, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  pulse: { id: 'pulse', glyph: 'wave', tier: 'spread', mpCost: 11, element: 'plain', power: 130, stat: 'mag', target: 'allFoes', kind: 'strike' },
  mend: { id: 'mend', glyph: 'drop', tier: 'normal', mpCost: 4, element: 'plain', power: 135, stat: 'mag', target: 'oneAlly', kind: 'heal' },
  chorus: { id: 'chorus', glyph: 'bloom', tier: 'spread', mpCost: 11, element: 'plain', power: 95, stat: 'mag', target: 'allAllies', kind: 'heal' },

  // --- everyone ----------------------------------------------------------
  // The free swing behind the ATTACK button, and the fallback for a monster
  // that has run itself out of MP. Nobody in this game can ever do nothing.
  strike: { id: 'strike', glyph: 'blade', tier: 'normal', mpCost: 0, element: 'plain', power: 100, stat: 'atk', target: 'oneFoe', kind: 'strike' },

  // --- monsters ----------------------------------------------------------
  bite: { id: 'bite', glyph: 'blade', tier: 'normal', mpCost: 0, element: 'plain', power: 110, stat: 'atk', target: 'oneFoe', kind: 'strike' },
  gnash: { id: 'gnash', glyph: 'fan', tier: 'spread', mpCost: 4, element: 'plain', power: 85, stat: 'atk', target: 'allFoes', kind: 'strike' },
  spit: {
    id: 'spit',
    glyph: 'skull',
    tier: 'normal',
    mpCost: 3,
    element: 'plain',
    power: 70,
    stat: 'atk',
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'poison', turns: 3, chance: 0.6 },
  },
  drench: { id: 'drench', glyph: 'burst', tier: 'normal', mpCost: 3, element: 'water', power: 130, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  scorch: { id: 'scorch', glyph: 'burst', tier: 'normal', mpCost: 3, element: 'fire', power: 130, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  sting: { id: 'sting', glyph: 'burst', tier: 'normal', mpCost: 3, element: 'leaf', power: 130, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  lullaby: {
    id: 'lullaby',
    glyph: 'moon',
    tier: 'normal',
    mpCost: 4,
    element: 'plain',
    power: 0,
    stat: 'mag',
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'sleep', turns: 2, chance: 0.5 },
  },
  wither: {
    id: 'wither',
    glyph: 'down',
    tier: 'normal',
    mpCost: 3,
    element: 'plain',
    power: 60,
    stat: 'atk',
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'atkDown', turns: 3, chance: 0.7 },
  },
  roar: { id: 'roar', glyph: 'fan', tier: 'spread', mpCost: 6, element: 'plain', power: 95, stat: 'atk', target: 'allFoes', kind: 'strike' },
  ruin: { id: 'ruin', glyph: 'greatblade', tier: 'strong', mpCost: 8, element: 'plain', power: 190, stat: 'atk', target: 'oneFoe', kind: 'strike' },
  knit: { id: 'knit', glyph: 'drop', tier: 'normal', mpCost: 6, element: 'plain', power: 120, stat: 'mag', target: 'self', kind: 'heal' },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export function targetsFoes(skill: Skill): boolean {
  return skill.target === 'oneFoe' || skill.target === 'allFoes';
}

export function isOffensive(skill: Skill): boolean {
  return skill.kind === 'strike' || skill.kind === 'afflict';
}

/** True when the skill lands on everyone on its side of the field. */
export function isSpread(skill: Skill): boolean {
  return skill.target === 'allFoes' || skill.target === 'allAllies';
}

/** What a row of the tray is made of: a colour, no colour, or healing. */
export type SkillRow = 'plain' | 'fire' | 'water' | 'leaf' | 'heal';

/** Fixed, so a row never moves under a thumb that has learned where it is. */
const ROW_ORDER: SkillRow[] = ['plain', 'fire', 'water', 'leaf', 'heal'];

export interface GridRow {
  row: SkillRow;
  /** One per weight, in TIERS order. `null` is a cell this hero has no skill for. */
  cells: (SkillId | null)[];
}

function rowOf(skill: Skill): SkillRow {
  if (skill.kind === 'heal') {
    return 'heal';
  }
  return skill.element === 'plain' ? 'plain' : skill.element;
}

/**
 * Arranges what a hero knows into the grid the tray draws.
 *
 * The position IS the label. Nothing on this screen is written down, so a
 * skill has to be identified by where it sits: down the side is what it is
 * made of, across is how hard it lands. That only teaches anything if the
 * columns line up, which is why a weight a hero has no skill for comes back
 * as a hole rather than being closed up — sliding `chorus` under the heavy
 * column would say there is a heavy heal, and there is not.
 *
 * Rows nobody has anything in are dropped, so a level-1 tray is one row and
 * not five mostly-empty ones.
 */
export function skillGrid(learned: readonly SkillId[]): GridRow[] {
  return ROW_ORDER.map((row) => ({
    row,
    cells: TIERS.map(
      (tier) =>
        learned.find((id) => rowOf(SKILLS[id]) === row && SKILLS[id].tier === tier) ?? null
    ),
  })).filter((entry) => entry.cells.some((cell) => cell !== null));
}
