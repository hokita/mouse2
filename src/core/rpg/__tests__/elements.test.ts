import { describe, expect, it } from 'vitest';
import { CASTABLE, WEAK_MULT, RESIST_MULT, affinityBand, elementMultiplier } from '../elements';

describe('elementMultiplier', () => {
  it('amplifies a hit on the weakness', () => {
    expect(elementMultiplier('fire', { weak: 'fire' })).toBe(WEAK_MULT);
  });

  it('blunts a hit on the resistance', () => {
    expect(elementMultiplier('ice', { weak: 'fire', resist: 'ice' })).toBe(RESIST_MULT);
  });

  it('leaves an unaligned hit alone', () => {
    expect(elementMultiplier('spark', { weak: 'fire', resist: 'ice' })).toBe(1);
  });

  it('leaves a hit alone when the target has no affinity at all', () => {
    expect(elementMultiplier('fire', {})).toBe(1);
  });

  it('never bends a plain hit, whatever the affinity', () => {
    // Physical damage is the one attack whose number always means the same
    // thing. With no words on screen, that is the player's baseline for
    // reading every other number as big or small.
    expect(elementMultiplier('plain', { weak: 'fire', resist: 'ice' })).toBe(1);
  });
});

describe('affinityBand', () => {
  it('names the band the UI has to draw', () => {
    expect(affinityBand(WEAK_MULT)).toBe('weak');
    expect(affinityBand(RESIST_MULT)).toBe('resist');
    expect(affinityBand(1)).toBe('neutral');
  });
});

describe('CASTABLE', () => {
  it('is the three coloured elements, and does not include plain', () => {
    expect(CASTABLE).toEqual(['fire', 'ice', 'spark']);
  });
});
