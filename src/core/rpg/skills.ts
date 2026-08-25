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
 * What the icon looks like. The wordless grammar is two-part and strict:
 *
 *   SHAPE says what the skill does. COLOUR says which element it is.
 *
 * So `torrent` and `flare` share the `burst` shape and differ only in tint,
 * and the player learns one shape once instead of five names never.
 */
export type SkillGlyph =
  | 'blade' // a heavy single hit
  | 'fan' // a sweep across everyone
  | 'burst' // a bolt at one target
  | 'wave' // a bolt at everyone
  | 'drop' // mends one
  | 'bloom' // mends or blesses over time
  | 'ring' // lifts what is stuck to you
  | 'skull' // poison
  | 'moon' // sleep
  | 'down'; // weakens

export type SkillKind = 'strike' | 'heal' | 'cure' | 'bless' | 'afflict';

export interface Inflict {
  status: StatusKind;
  turns: number;
  /** 0-1. Nothing lands for certain, so a bad turn is never purely bad luck. */
  chance: number;
}

export interface Skill {
  id: SkillId;
  glyph: SkillGlyph;
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
  | 'cleave'
  | 'daunt'
  | 'crush'
  // Wizard
  | 'torrent'
  | 'thorn'
  | 'flare'
  | 'lull'
  | 'bramble'
  // Hero
  | 'mend'
  | 'force'
  | 'nova'
  | 'cleanse'
  | 'bloom'
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
  hew: { id: 'hew', glyph: 'blade', mpCost: 4, element: 'plain', power: 145, stat: 'atk', target: 'oneFoe', kind: 'strike' },
  cleave: { id: 'cleave', glyph: 'fan', mpCost: 6, element: 'plain', power: 80, stat: 'atk', target: 'allFoes', kind: 'strike' },
  daunt: {
    id: 'daunt',
    glyph: 'down',
    mpCost: 4,
    element: 'plain',
    power: 40,
    stat: 'atk',
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'atkDown', turns: 3, chance: 0.8 },
  },
  crush: { id: 'crush', glyph: 'blade', mpCost: 8, element: 'plain', power: 210, stat: 'atk', target: 'oneFoe', kind: 'strike' },

  // --- Wizard: the only source of all three colours ----------------------
  // Identical cost and power on purpose. The three bolts exist to make the
  // player answer one question every turn — what colour is that thing? — and
  // any difference in price would let them answer a cheaper question instead.
  torrent: { id: 'torrent', glyph: 'burst', mpCost: 4, element: 'water', power: 150, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  thorn: { id: 'thorn', glyph: 'burst', mpCost: 4, element: 'leaf', power: 150, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  flare: { id: 'flare', glyph: 'burst', mpCost: 4, element: 'fire', power: 150, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  lull: {
    id: 'lull',
    glyph: 'moon',
    mpCost: 5,
    element: 'plain',
    power: 0,
    stat: 'mag',
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'sleep', turns: 2, chance: 0.7 },
  },
  bramble: { id: 'bramble', glyph: 'wave', mpCost: 10, element: 'leaf', power: 105, stat: 'mag', target: 'allFoes', kind: 'strike' },

  // --- Hero: untyped magic, and every heal in the game --------------------
  mend: { id: 'mend', glyph: 'drop', mpCost: 4, element: 'plain', power: 135, stat: 'mag', target: 'oneAlly', kind: 'heal' },
  // Untyped, and that is the entire point. The Wizard's bolts swing between
  // 1.75x and 0.5x on whether the player read the colour right; these two
  // never move. So the daughter is what a player reaches for when they
  // cannot tell what they are looking at, and the price of that certainty is
  // a ceiling: a matched flare beats `nova` every time.
  force: { id: 'force', glyph: 'burst', mpCost: 5, element: 'plain', power: 190, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  nova: { id: 'nova', glyph: 'burst', mpCost: 9, element: 'plain', power: 240, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  cleanse: { id: 'cleanse', glyph: 'ring', mpCost: 3, element: 'plain', power: 0, stat: 'mag', target: 'oneAlly', kind: 'cure' },
  bloom: {
    id: 'bloom',
    glyph: 'bloom',
    mpCost: 5,
    element: 'plain',
    power: 0,
    stat: 'mag',
    target: 'oneAlly',
    kind: 'bless',
    inflicts: { status: 'regen', turns: 4, chance: 1 },
  },
  chorus: { id: 'chorus', glyph: 'bloom', mpCost: 11, element: 'plain', power: 95, stat: 'mag', target: 'allAllies', kind: 'heal' },

  // --- everyone ----------------------------------------------------------
  // The free swing behind the ATTACK button, and the fallback for a monster
  // that has run itself out of MP. Nobody in this game can ever do nothing.
  strike: { id: 'strike', glyph: 'blade', mpCost: 0, element: 'plain', power: 100, stat: 'atk', target: 'oneFoe', kind: 'strike' },

  // --- monsters ----------------------------------------------------------
  bite: { id: 'bite', glyph: 'blade', mpCost: 0, element: 'plain', power: 110, stat: 'atk', target: 'oneFoe', kind: 'strike' },
  gnash: { id: 'gnash', glyph: 'fan', mpCost: 4, element: 'plain', power: 85, stat: 'atk', target: 'allFoes', kind: 'strike' },
  spit: {
    id: 'spit',
    glyph: 'skull',
    mpCost: 3,
    element: 'plain',
    power: 70,
    stat: 'atk',
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'poison', turns: 3, chance: 0.6 },
  },
  drench: { id: 'drench', glyph: 'burst', mpCost: 3, element: 'water', power: 130, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  scorch: { id: 'scorch', glyph: 'burst', mpCost: 3, element: 'fire', power: 130, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  sting: { id: 'sting', glyph: 'burst', mpCost: 3, element: 'leaf', power: 130, stat: 'mag', target: 'oneFoe', kind: 'strike' },
  lullaby: {
    id: 'lullaby',
    glyph: 'moon',
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
    mpCost: 3,
    element: 'plain',
    power: 60,
    stat: 'atk',
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'atkDown', turns: 3, chance: 0.7 },
  },
  roar: { id: 'roar', glyph: 'fan', mpCost: 6, element: 'plain', power: 95, stat: 'atk', target: 'allFoes', kind: 'strike' },
  ruin: { id: 'ruin', glyph: 'blade', mpCost: 8, element: 'plain', power: 190, stat: 'atk', target: 'oneFoe', kind: 'strike' },
  knit: { id: 'knit', glyph: 'drop', mpCost: 6, element: 'plain', power: 120, stat: 'mag', target: 'self', kind: 'heal' },
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
