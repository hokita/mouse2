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
 * So `frost` and `flare` share the `burst` shape and differ only in tint,
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
  target: TargetShape;
  kind: SkillKind;
  inflicts?: Inflict;
}

export type SkillId =
  // Vanguard
  | 'ember'
  | 'cleave'
  | 'daunt'
  | 'crush'
  // Caster
  | 'frost'
  | 'spark'
  | 'flare'
  | 'lull'
  | 'storm'
  // Warden
  | 'mend'
  | 'venom'
  | 'cleanse'
  | 'bloom'
  | 'chorus'
  // monsters
  | 'bite'
  | 'gnash'
  | 'spit'
  | 'chill'
  | 'scorch'
  | 'jolt'
  | 'lullaby'
  | 'wither'
  | 'roar'
  | 'ruin'
  | 'knit';

export const SKILLS: Record<SkillId, Skill> = {
  // --- Vanguard: a body in the way, and the only physical burst ----------
  ember: { id: 'ember', glyph: 'blade', mpCost: 4, element: 'fire', power: 145, target: 'oneFoe', kind: 'strike' },
  cleave: { id: 'cleave', glyph: 'fan', mpCost: 6, element: 'plain', power: 80, target: 'allFoes', kind: 'strike' },
  daunt: {
    id: 'daunt',
    glyph: 'down',
    mpCost: 4,
    element: 'plain',
    power: 40,
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'atkDown', turns: 3, chance: 0.8 },
  },
  crush: { id: 'crush', glyph: 'blade', mpCost: 8, element: 'plain', power: 210, target: 'oneFoe', kind: 'strike' },

  // --- Caster: the only source of all three colours ----------------------
  // Identical cost and power on purpose. The three bolts exist to make the
  // player answer one question every turn — what colour is that thing? — and
  // any difference in price would let them answer a cheaper question instead.
  frost: { id: 'frost', glyph: 'burst', mpCost: 4, element: 'ice', power: 150, target: 'oneFoe', kind: 'strike' },
  spark: { id: 'spark', glyph: 'burst', mpCost: 4, element: 'spark', power: 150, target: 'oneFoe', kind: 'strike' },
  flare: { id: 'flare', glyph: 'burst', mpCost: 4, element: 'fire', power: 150, target: 'oneFoe', kind: 'strike' },
  lull: {
    id: 'lull',
    glyph: 'moon',
    mpCost: 5,
    element: 'plain',
    power: 0,
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'sleep', turns: 2, chance: 0.7 },
  },
  storm: { id: 'storm', glyph: 'wave', mpCost: 10, element: 'spark', power: 105, target: 'allFoes', kind: 'strike' },

  // --- Warden: keeps the other two upright -------------------------------
  mend: { id: 'mend', glyph: 'drop', mpCost: 4, element: 'plain', power: 135, target: 'oneAlly', kind: 'heal' },
  venom: {
    id: 'venom',
    glyph: 'skull',
    mpCost: 4,
    element: 'plain',
    power: 55,
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'poison', turns: 4, chance: 0.85 },
  },
  cleanse: { id: 'cleanse', glyph: 'ring', mpCost: 3, element: 'plain', power: 0, target: 'oneAlly', kind: 'cure' },
  bloom: {
    id: 'bloom',
    glyph: 'bloom',
    mpCost: 5,
    element: 'plain',
    power: 0,
    target: 'oneAlly',
    kind: 'bless',
    inflicts: { status: 'regen', turns: 4, chance: 1 },
  },
  chorus: { id: 'chorus', glyph: 'bloom', mpCost: 11, element: 'plain', power: 95, target: 'allAllies', kind: 'heal' },

  // --- monsters ----------------------------------------------------------
  bite: { id: 'bite', glyph: 'blade', mpCost: 0, element: 'plain', power: 110, target: 'oneFoe', kind: 'strike' },
  gnash: { id: 'gnash', glyph: 'fan', mpCost: 4, element: 'plain', power: 85, target: 'allFoes', kind: 'strike' },
  spit: {
    id: 'spit',
    glyph: 'skull',
    mpCost: 3,
    element: 'plain',
    power: 70,
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'poison', turns: 3, chance: 0.6 },
  },
  chill: { id: 'chill', glyph: 'burst', mpCost: 3, element: 'ice', power: 130, target: 'oneFoe', kind: 'strike' },
  scorch: { id: 'scorch', glyph: 'burst', mpCost: 3, element: 'fire', power: 130, target: 'oneFoe', kind: 'strike' },
  jolt: { id: 'jolt', glyph: 'burst', mpCost: 3, element: 'spark', power: 130, target: 'oneFoe', kind: 'strike' },
  lullaby: {
    id: 'lullaby',
    glyph: 'moon',
    mpCost: 4,
    element: 'plain',
    power: 0,
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
    target: 'oneFoe',
    kind: 'afflict',
    inflicts: { status: 'atkDown', turns: 3, chance: 0.7 },
  },
  roar: { id: 'roar', glyph: 'fan', mpCost: 6, element: 'plain', power: 95, target: 'allFoes', kind: 'strike' },
  ruin: { id: 'ruin', glyph: 'blade', mpCost: 8, element: 'plain', power: 190, target: 'oneFoe', kind: 'strike' },
  knit: { id: 'knit', glyph: 'drop', mpCost: 6, element: 'plain', power: 120, target: 'self', kind: 'heal' },
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
