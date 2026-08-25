import { describe, expect, it } from 'vitest';
import {
  BEATS,
  CASTABLE,
  RESIST_MULT,
  WEAK_MULT,
  affinityBand,
  affinityOf,
  beatenBy,
  elementMultiplier,
  isCastable,
} from '../elements';

describe('the triangle', () => {
  it('is a single cycle through all three colours', () => {
    // Three hops from anywhere lands back where it started, and no shorter
    // walk does. That is what makes it one cycle rather than a pair and a
    // stray — and one cycle is the only shape the badge can draw honestly.
    for (const element of CASTABLE) {
      expect(BEATS[element]).not.toBe(element);
      expect(BEATS[BEATS[element]]).not.toBe(element);
      expect(BEATS[BEATS[BEATS[element]]]).toBe(element);
    }
  });

  it('beats every colour exactly once', () => {
    expect(new Set(CASTABLE.map((e) => BEATS[e])).size).toBe(CASTABLE.length);
  });

  it('reads the cycle backwards to say who beats me', () => {
    for (const element of CASTABLE) {
      expect(BEATS[beatenBy(element)]).toBe(element);
    }
  });
});

describe('affinityOf', () => {
  it('makes a monster weak to whatever beats its colour', () => {
    expect(affinityOf('fire').weak).toBe('water');
    expect(affinityOf('water').weak).toBe('leaf');
    expect(affinityOf('leaf').weak).toBe('fire');
  });

  it('makes a monster shrug off whatever its own colour beats', () => {
    expect(affinityOf('fire').resist).toBe('leaf');
    expect(affinityOf('water').resist).toBe('fire');
    expect(affinityOf('leaf').resist).toBe('water');
  });

  it('never makes anything weak to what it resists', () => {
    for (const element of CASTABLE) {
      const { weak, resist } = affinityOf(element);
      expect(weak).not.toBe(resist);
    }
  });

  it('leaves each colour neutral against its own kind', () => {
    // The third case, and the one the badge cannot draw: fire on fire is
    // simply a hit. With three colours there is nowhere else for it to go.
    for (const element of CASTABLE) {
      expect(elementMultiplier(element, affinityOf(element))).toBe(1);
    }
  });
});

describe('elementMultiplier', () => {
  it('amplifies a hit on the weakness', () => {
    expect(elementMultiplier('water', affinityOf('fire'))).toBe(WEAK_MULT);
  });

  it('blunts a hit on the resistance', () => {
    expect(elementMultiplier('leaf', affinityOf('fire'))).toBe(RESIST_MULT);
  });

  it('leaves a hit alone when the target has no affinity at all', () => {
    expect(elementMultiplier('fire', {})).toBe(1);
  });

  it('never bends a plain hit, whatever the affinity', () => {
    // Physical damage is the one attack whose number always means the same
    // thing. With no words on screen, that is the player's baseline for
    // reading every other number as big or small.
    expect(elementMultiplier('plain', affinityOf('leaf'))).toBe(1);
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
    expect(CASTABLE).toEqual(['fire', 'water', 'leaf']);
    expect(isCastable('plain')).toBe(false);
    for (const element of CASTABLE) {
      expect(isCastable(element)).toBe(true);
    }
  });
});
