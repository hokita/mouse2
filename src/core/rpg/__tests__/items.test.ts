import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_IDS, startingBag } from '../items';

describe('the item table', () => {
  it('keys every entry by its own id', () => {
    for (const id of ITEM_IDS) {
      expect(ITEMS[id].id).toBe(id);
    }
  });

  it('gives every item a glyph, because the name is never shown', () => {
    for (const id of ITEM_IDS) {
      expect(ITEMS[id].glyph).toBeTruthy();
    }
  });

  it('keeps the set small enough to read as a row of icons', () => {
    expect(ITEM_IDS.length).toBeLessThanOrEqual(4);
  });

  it('restores by share of maximum, so a potion stays useful at every level', () => {
    expect(ITEMS.potion.hpFraction).toBeGreaterThan(0);
    expect(ITEMS.potion.hpFraction).toBeLessThanOrEqual(1);
  });
});

describe('startingBag', () => {
  it('opens the run with something to drink and nothing else', () => {
    const bag = startingBag();
    expect(bag.potion).toBeGreaterThan(0);
    expect(bag.bomb ?? 0).toBe(0);
  });

  it('hands out a fresh bag each time', () => {
    const a = startingBag();
    a.potion = 99;
    expect(startingBag().potion).not.toBe(99);
  });
});
