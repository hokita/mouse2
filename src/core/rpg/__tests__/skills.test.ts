import { describe, expect, it } from 'vitest';
import { SKILLS, SKILL_IDS, TIERS, isOffensive, isSpread, skillGrid, targetsFoes } from '../skills';

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

  it('does nothing but strike, mend and afflict', () => {
    // Curing and blessing left with the daughter's `cleanse` and `bloom`. The
    // bag still lifts an ailment; no spell does.
    for (const id of SKILL_IDS) {
      expect(['strike', 'heal', 'afflict']).toContain(SKILLS[id].kind);
    }
  });

  it('gives every strike and every mend some power', () => {
    for (const id of SKILL_IDS) {
      const skill = SKILLS[id];
      if (skill.kind === 'strike' || skill.kind === 'heal') {
        expect(skill.power).toBeGreaterThan(0);
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

  it('points healing at allies, and strikes at foes', () => {
    for (const id of SKILL_IDS) {
      const skill = SKILLS[id];
      if (skill.kind === 'heal') {
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
    expect(SKILLS.thicket.mpCost).toBeGreaterThan(SKILLS.thorn.mpCost);
    expect(SKILLS.chorus.mpCost).toBeGreaterThan(SKILLS.mend.mpCost);
    expect(SKILLS.cleave.mpCost).toBeGreaterThan(SKILLS.hew.mpCost);
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

describe('the three weights', () => {
  // Every skill is cut to one of three: a plain hit, a heavy one, or one that
  // lands on everybody. Three is the whole vocabulary, so a player who has
  // read the weight of one skill has read the weight of all seventeen.
  it('files every skill under exactly one of them', () => {
    for (const id of SKILL_IDS) {
      expect(TIERS).toContain(SKILLS[id].tier);
    }
  });

  it('is the same question as whether the skill lands on everybody', () => {
    // The weight is not a second, hidden fact. `spread` IS the wide target,
    // so the tray can never draw a column that contradicts the resolver.
    for (const id of SKILL_IDS) {
      expect(isSpread(SKILLS[id])).toBe(SKILLS[id].tier === 'spread');
    }
  });
});

describe('skillGrid', () => {
  // The tray is drawn from this. A skill's place in it is the only label it
  // will ever have: down the side is what the skill is made of, across is how
  // hard it lands, so a player who has cast one cell can read its neighbours.

  it('lays the father out as a single row of three', () => {
    expect(skillGrid(['hew', 'crush', 'cleave'])).toEqual([
      { row: 'plain', cells: ['hew', 'crush', 'cleave'] },
    ]);
  });

  it('lays the mother out as three colours by three weights', () => {
    const grid = skillGrid([
      'flare',
      'torrent',
      'thorn',
      'blaze',
      'deluge',
      'bramble',
      'wildfire',
      'flood',
      'thicket',
    ]);
    expect(grid).toEqual([
      { row: 'fire', cells: ['flare', 'blaze', 'wildfire'] },
      { row: 'water', cells: ['torrent', 'deluge', 'flood'] },
      { row: 'leaf', cells: ['thorn', 'bramble', 'thicket'] },
    ]);
  });

  it('leaves a hole where a weight does not exist, so the columns stay true', () => {
    // There is no heavy heal. The gap has to be drawn as a gap: closing it up
    // would slide `chorus` under the heavy column and teach a lie.
    expect(skillGrid(['mend', 'chorus'])).toEqual([
      { row: 'heal', cells: ['mend', null, 'chorus'] },
    ]);
  });

  it('holds a place for a weight not learned yet', () => {
    expect(skillGrid(['hew'])).toEqual([{ row: 'plain', cells: ['hew', null, null] }]);
  });

  it('drops a row nobody has anything in', () => {
    const rows = skillGrid(['force', 'mend']).map((entry) => entry.row);
    expect(rows).toEqual(['plain', 'heal']);
  });

  it('orders the rows the same way whatever order the skills arrive in', () => {
    const forwards = skillGrid(['mend', 'force', 'chorus', 'nova']);
    const backwards = skillGrid(['nova', 'chorus', 'force', 'mend']);
    expect(backwards).toEqual(forwards);
  });
});

describe('isOffensive', () => {
  it('is true for anything aimed at the other side', () => {
    expect(isOffensive(SKILLS.hew)).toBe(true);
    expect(isOffensive(SKILLS.wither)).toBe(true);
    expect(isOffensive(SKILLS.mend)).toBe(false);
    expect(isOffensive(SKILLS.chorus)).toBe(false);
  });
});

describe('the stat behind a skill', () => {
  it('is named on every skill rather than guessed from its colour', () => {
    for (const id of SKILL_IDS) {
      expect(['atk', 'mag']).toContain(SKILLS[id].stat);
    }
  });

  it('swings muscle behind the Warrior and magic behind the Wizard bolts', () => {
    // Both `hew` and `force` are `plain`, and they run on opposite stats.
    // That pair is why the stat is written down rather than read off the
    // colour: with no colour there, there is nothing to read it off.
    expect(SKILLS.hew.stat).toBe('atk');
    expect(SKILLS.force.stat).toBe('mag');
    expect(SKILLS.flare.stat).toBe('mag');
  });

  it('gives everyone a free swing to fall back on', () => {
    expect(SKILLS.strike.mpCost).toBe(0);
    expect(SKILLS.strike.target).toBe('oneFoe');
  });
});
