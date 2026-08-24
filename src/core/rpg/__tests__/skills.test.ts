import { describe, expect, it } from 'vitest';
import { SKILLS, SKILL_IDS, isOffensive, targetsFoes } from '../skills';

describe('the skill table', () => {
  it('keys every entry by its own id', () => {
    for (const id of SKILL_IDS) {
      expect(SKILLS[id].id).toBe(id);
    }
  });

  it('never charges a negative price', () => {
    for (const id of SKILL_IDS) {
      expect(SKILLS[id].mpCost).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every skill a glyph, because the name is never shown', () => {
    for (const id of SKILL_IDS) {
      expect(SKILLS[id].glyph).toBeTruthy();
    }
  });

  it('only tints an elemental skill when it actually deals damage', () => {
    // Colour means element and element means damage. A coloured glyph that
    // heals would teach the player a rule that is not true.
    for (const id of SKILL_IDS) {
      const skill = SKILLS[id];
      if (skill.element !== 'plain') {
        expect(skill.kind).toBe('strike');
      }
    }
  });

  it('gives every strike some power, and every pure utility none', () => {
    for (const id of SKILL_IDS) {
      const skill = SKILLS[id];
      if (skill.kind === 'strike' || skill.kind === 'heal') {
        expect(skill.power).toBeGreaterThan(0);
      }
      if (skill.kind === 'cure' || skill.kind === 'bless') {
        expect(skill.power).toBe(0);
      }
    }
  });

  it('keeps every inflict chance a real probability', () => {
    for (const id of SKILL_IDS) {
      const inflicts = SKILLS[id].inflicts;
      if (inflicts) {
        expect(inflicts.chance).toBeGreaterThan(0);
        expect(inflicts.chance).toBeLessThanOrEqual(1);
        expect(inflicts.turns).toBeGreaterThan(0);
      }
    }
  });

  it('points healing and blessing at allies, and strikes at foes', () => {
    for (const id of SKILL_IDS) {
      const skill = SKILLS[id];
      if (skill.kind === 'heal' || skill.kind === 'cure' || skill.kind === 'bless') {
        expect(targetsFoes(skill)).toBe(false);
      }
      if (skill.kind === 'strike' || skill.kind === 'afflict') {
        expect(targetsFoes(skill)).toBe(true);
      }
    }
  });

  it('charges more for hitting everyone than for hitting one', () => {
    // Otherwise the single-target skills are never the right answer and the
    // command menu is decoration.
    expect(SKILLS.bramble.mpCost).toBeGreaterThan(SKILLS.thorn.mpCost);
    expect(SKILLS.chorus.mpCost).toBeGreaterThan(SKILLS.mend.mpCost);
    expect(SKILLS.cleave.mpCost).toBeGreaterThan(SKILLS.ember.mpCost);
  });

  it('covers all three elements between the Wizard bolts', () => {
    const elements = ['flare', 'torrent', 'thorn'].map((id) => SKILLS[id as 'flare'].element);
    expect([...elements].sort()).toEqual(['fire', 'leaf', 'water']);
  });

  it('prices the three bolts identically, so the choice is colour and never cost', () => {
    const costs = new Set(['flare', 'torrent', 'thorn'].map((id) => SKILLS[id as 'flare'].mpCost));
    const powers = new Set(['flare', 'torrent', 'thorn'].map((id) => SKILLS[id as 'flare'].power));
    expect(costs.size).toBe(1);
    expect(powers.size).toBe(1);
  });
});

describe('isOffensive', () => {
  it('is true for anything aimed at the other side', () => {
    expect(isOffensive(SKILLS.ember)).toBe(true);
    expect(isOffensive(SKILLS.daunt)).toBe(true);
    expect(isOffensive(SKILLS.mend)).toBe(false);
    expect(isOffensive(SKILLS.cleanse)).toBe(false);
  });
});

describe('the stat behind a skill', () => {
  it('is named on every skill rather than guessed from its colour', () => {
    for (const id of SKILL_IDS) {
      expect(['atk', 'mag']).toContain(SKILLS[id].stat);
    }
  });

  it('swings muscle behind the Warrior fire skill and magic behind the Wizard bolts', () => {
    // `ember` is a burning sword, not a spell. Reading the stat off the
    // element would power the game's heaviest hitter with its worst number.
    expect(SKILLS.ember.stat).toBe('atk');
    expect(SKILLS.flare.stat).toBe('mag');
  });

  it('gives everyone a free swing to fall back on', () => {
    expect(SKILLS.strike.mpCost).toBe(0);
    expect(SKILLS.strike.target).toBe('oneFoe');
  });
});
