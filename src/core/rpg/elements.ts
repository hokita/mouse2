// The elemental triangle, and the only lesson the game ever has to teach.
//
// With no text on screen there is no bestiary entry to read and no tutorial
// box to dismiss. What the player has instead is a cycle they can see drawn
// in one corner of the fight: fire burns leaf, leaf drinks water, water
// drowns fire. A monster is painted the colour it *is*, and the badge in the
// corner says what beats it.
//
// That indirection is bought deliberately. An earlier version painted each
// monster in the colour of its own weakness, so the rule was "hit it with the
// colour it already is" — shorter to learn, but it left nothing to look up,
// and the resistances stayed invisible because there was no second rule they
// could hang off. One cycle answers both questions at once: what hurts this,
// and what will bounce off it.
//
// The multipliers have to be far enough apart to be unmistakable at a glance,
// because the damage number is the only confirmation the player ever gets.
// 1.75x against 0.5x is a three-and-a-half-fold spread; a gentler 1.2/0.8
// would be arithmetic the player has to do rather than see.

export type Element = 'fire' | 'water' | 'leaf' | 'plain';

/** The three coloured elements a skill can carry. `plain` is a fist. */
export type CastableElement = 'fire' | 'water' | 'leaf';

export const CASTABLE = ['fire', 'water', 'leaf'] as const satisfies readonly CastableElement[];

export const WEAK_MULT = 1.75;
export const RESIST_MULT = 0.5;

/**
 * The cycle. Every rule about elements in this game is derived from it and
 * nothing anywhere is allowed to state an affinity by hand — a table of
 * hand-written weaknesses is a table that can drift out of step with the
 * badge on screen, and a badge that lies about the rules is worse than no
 * badge at all.
 */
export const BEATS: Record<CastableElement, CastableElement> = {
  fire: 'leaf',
  leaf: 'water',
  water: 'fire',
};

export function isCastable(element: Element): element is CastableElement {
  return element !== 'plain';
}

/** The cycle read backwards: the one colour that burns this one. */
export function beatenBy(element: CastableElement): CastableElement {
  return CASTABLE.find((candidate) => BEATS[candidate] === element)!;
}

/** What a combatant burns for and what it shrugs off. Both optional. */
export interface Affinity {
  weak?: Element;
  resist?: Element;
}

/**
 * A combatant's affinity, read straight off the cycle.
 *
 * Weak to whatever beats your colour, armoured against whatever your colour
 * beats. Three colours means there is exactly one of each and one left over —
 * your own kind, which is simply a hit.
 */
export function affinityOf(element: CastableElement): Affinity {
  return { weak: beatenBy(element), resist: BEATS[element] };
}

/** The three ways a hit can land, for the scene to draw. */
export type AffinityBand = 'weak' | 'resist' | 'neutral';

export function elementMultiplier(attack: Element, affinity: Affinity): number {
  // Physical damage is deliberately unbendable. It is the player's ruler: the
  // only number on screen that means the same thing every time, and therefore
  // the thing every elemental number is read against.
  if (attack === 'plain') {
    return 1;
  }
  if (affinity.weak === attack) {
    return WEAK_MULT;
  }
  if (affinity.resist === attack) {
    return RESIST_MULT;
  }
  return 1;
}

export function affinityBand(multiplier: number): AffinityBand {
  if (multiplier > 1) {
    return 'weak';
  }
  if (multiplier < 1) {
    return 'resist';
  }
  return 'neutral';
}
