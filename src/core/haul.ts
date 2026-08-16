// What a landed fish is worth. What swims, and what bites, is the school's
// business (core/school.ts); this is only the price list.

export type CatchRarity = 'common' | 'fine' | 'big' | 'golden';

export const CATCH_POINTS: Record<CatchRarity, number> = {
  common: 10,
  fine: 20,
  big: 30,
  golden: 50,
};

/** Every rarity, cheapest first. */
export const RARITIES: CatchRarity[] = ['common', 'fine', 'big', 'golden'];
