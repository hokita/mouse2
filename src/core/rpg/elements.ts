// The elemental triangle, and the only lesson the game ever has to teach.
//
// With no text on screen there is no bestiary entry to read and no tutorial
// box to dismiss. What the player has instead is a colour: an enemy IS amber,
// and amber burns. Hit it with fire and the damage number comes back large
// and tinted; hit it with the wrong colour and the number is small and grey.
// That loop — pick a colour, read the number — is the whole tutorial, so the
// multipliers below have to be far enough apart to be unmistakable at a
// glance. 1.75x against 0.5x is a three-and-a-half-fold spread; a gentler
// 1.2/0.8 would be arithmetic the player has to do rather than see.

export type Element = 'fire' | 'water' | 'leaf' | 'plain';

/** The three coloured elements a skill can carry. `plain` is a fist. */
export const CASTABLE = ['fire', 'water', 'leaf'] as const satisfies readonly Element[];

export const WEAK_MULT = 1.75;
export const RESIST_MULT = 0.5;

/** What a combatant burns for and what it shrugs off. Both optional. */
export interface Affinity {
  weak?: Element;
  resist?: Element;
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
