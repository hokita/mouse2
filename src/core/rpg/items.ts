import type { Element } from './elements';

// Four consumables, and four is the ceiling: the item tray is a row of icons
// along the bottom of a phone, and a fifth would either shrink the targets
// below a thumb or need a scroll nobody would discover.
//
// Restoration is a share of the bearer's maximum rather than a flat number,
// so the potion the player finds in the first hour is still the potion they
// want in the last one — no tiering, no upgrade path, no explaining.

export type ItemId = 'potion' | 'ether' | 'antidote' | 'bomb';

export type ItemGlyph = 'flask' | 'vial' | 'leaf' | 'orb';

export interface Item {
  id: ItemId;
  glyph: ItemGlyph;
  /** Where it lands. Same actor-relative vocabulary as skills. */
  target: 'oneAlly' | 'allFoes';
  /** Share of the target's maximum HP restored. */
  hpFraction?: number;
  /** Flat MP restored — MP maxima are small, so a share would round to nothing. */
  mpRestore?: number;
  /** Clears poison, sleep and attack-down. */
  cures?: boolean;
  /** Damage that ignores the thrower entirely — a bomb is a bomb. */
  flatDamage?: number;
  element?: Element;
}

export const ITEMS: Record<ItemId, Item> = {
  potion: { id: 'potion', glyph: 'flask', target: 'oneAlly', hpFraction: 0.45 },
  ether: { id: 'ether', glyph: 'vial', target: 'oneAlly', mpRestore: 10 },
  antidote: { id: 'antidote', glyph: 'leaf', target: 'oneAlly', cures: true },
  bomb: { id: 'bomb', glyph: 'orb', target: 'allFoes', flatDamage: 38, element: 'fire' },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** How many of each the player is carrying. Missing means none. */
export type Bag = Partial<Record<ItemId, number>> & { potion: number };

/**
 * Two potions and nothing else.
 *
 * The first fight should be survivable without opening the bag at all, and
 * the rest of the tray should arrive from treasure — an icon the player was
 * given is one they remember, an icon that was always there is wallpaper.
 */
export function startingBag(): Bag {
  return { potion: 2 };
}
