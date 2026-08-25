import { describe, expect, it } from 'vitest';
import {
  HEROES,
  PARTY_ORDER,
  REVIVE_FRACTION,
  awardExp,
  createParty,
  heroStats,
  isAlive,
  learnedSkills,
  restHero,
  reviveAfterVictory,
} from '../party';
import type { Hero } from '../party';
import { MAX_LEVEL, expToReach } from '../stats';
import { SKILLS, SKILL_IDS, TIERS } from '../skills';
import type { Skill, SkillTier } from '../skills';
import { CASTABLE, RESIST_MULT, WEAK_MULT, isCastable } from '../elements';
import type { HeroId } from '../party';

const dad = () => createParty().find((h) => h.id === 'dad')!;

const learnsetOf = (id: HeroId): Skill[] => HEROES[id].learnset.map((entry) => SKILLS[entry.skill]);

const strikesOf = (id: HeroId): Skill[] => learnsetOf(id).filter((skill) => skill.kind === 'strike');

/** Every colour anywhere in a hero's learnset, at any level. */
const coloursOf = (id: HeroId): string[] => [
  ...new Set(learnsetOf(id).map((skill) => skill.element).filter(isCastable)),
];

describe('the roster', () => {
  it('fields exactly three, which is what fits above a command menu', () => {
    expect(PARTY_ORDER).toHaveLength(3);
    expect(createParty()).toHaveLength(3);
  });

  it('gives everyone something to cast in the very first fight', () => {
    for (const id of PARTY_ORDER) {
      expect(HEROES[id].learnset.some((entry) => entry.level === 1)).toBe(true);
    }
  });

  // The three of them have to be tellable apart with the sound off and no
  // words on screen, which means each one owns something the other two never
  // touch. Colour is the mother's, healing is the daughter's, and the father
  // is the only one who never lights up at all.
  describe('one job each', () => {
    it('puts every colour in the game in the mother, and only her', () => {
      expect(coloursOf('mom').sort()).toEqual([...CASTABLE].sort());
      expect(coloursOf('dad')).toEqual([]);
      expect(coloursOf('daughter')).toEqual([]);
    });

    it('leaves the father nothing but muscle that costs MP', () => {
      // His second command button is a fist, not a rod. If a single skill of
      // his carried a colour the button would be lying about what it opens.
      for (const entry of HEROES.dad.learnset) {
        const skill = SKILLS[entry.skill];
        expect(isCastable(skill.element)).toBe(false);
        expect(skill.stat).toBe('atk');
        expect(skill.mpCost).toBeGreaterThan(0);
      }
    });

    it('gives the daughter untyped magic and every heal there is', () => {
      const hers = HEROES.daughter.learnset.map((entry) => SKILLS[entry.skill]);
      for (const skill of hers) {
        expect(isCastable(skill.element)).toBe(false);
        expect(skill.stat).toBe('mag');
      }

      // Every mending move in the game that points at somebody else is hers.
      // `target: 'self'` is excluded because that is the boss patching its
      // own wounds, which is not a thing anyone in the party can be handed.
      const mending = SKILL_IDS.filter((id) => {
        const skill = SKILLS[id];
        return ['heal', 'cure', 'bless'].includes(skill.kind) && skill.target !== 'self';
      });
      for (const id of mending) {
        expect(HEROES.daughter.learnset.map((e) => e.skill)).toContain(id);
      }
    });
  });

  it('only teaches skills that exist, and never past the level cap', () => {
    for (const id of PARTY_ORDER) {
      for (const entry of HEROES[id].learnset) {
        expect(SKILLS[entry.skill]).toBeTruthy();
        expect(entry.level).toBeLessThanOrEqual(MAX_LEVEL);
      }
    }
  });

  it('gives the daughter untyped damage, so she never reads a colour wrong', () => {
    // Her whole identity against the other two: the Wizard's bolts swing
    // between 1.75x and 0.5x on a guess, and the daughter's never move. She
    // is the floor the player falls back to when the colour is unclear.
    const damage = HEROES.daughter.learnset
      .map((entry) => SKILLS[entry.skill])
      .filter((skill) => skill.kind === 'strike');
    expect(damage.length).toBeGreaterThan(0);
    for (const skill of damage) {
      expect(skill.element).toBe('plain');
      expect(skill.stat).toBe('mag');
    }
  });

  it('hits harder than a colour the Wizard got wrong and softer than one she got right', () => {
    // The trade has to be real in both directions, or untyped is just worse.
    // Read weight for weight: the daughter's heavy bolt is measured against
    // the mother's heavy bolt, never against her light one.
    for (const untyped of strikesOf('daughter')) {
      const coloured = learnsetOf('mom').find((skill) => skill.tier === untyped.tier)!;
      expect(untyped.power).toBeGreaterThan(coloured.power * RESIST_MULT);
      expect(untyped.power).toBeLessThan(coloured.power * WEAK_MULT);
    }
  });

  it('keeps every heal in her hands, so exactly one hero is the lifeline', () => {
    for (const id of PARTY_ORDER) {
      const heals = HEROES[id].learnset.filter((e) => SKILLS[e.skill].kind === 'heal');
      expect(heals.length > 0).toBe(id === 'daughter');
    }
  });

  it('makes the three genuinely different rather than differently painted', () => {
    const stats = PARTY_ORDER.map((id) => HEROES[id].base);
    expect(new Set(stats.map((s) => s.maxHp)).size).toBe(3);
    // The Warrior is the wall, the Wizard is the artillery.
    expect(HEROES.dad.base.maxHp).toBeGreaterThan(HEROES.mom.base.maxHp);
    expect(HEROES.mom.base.mag).toBeGreaterThan(HEROES.dad.base.mag);
    // The Hero is quick, so a heal can beat the blow it answers.
    expect(HEROES.daughter.base.spd).toBeGreaterThan(HEROES.dad.base.spd);
  });

  it('grows everyone in every stat, so no level is a disappointment', () => {
    for (const id of PARTY_ORDER) {
      const growth = HEROES[id].growth;
      for (const value of Object.values(growth)) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

describe('the grid the party is cut from', () => {
  // Three weights across, and down the side: the father's muscle, the
  // mother's three colours, the daughter's colourless bolt and her healing.
  // Seventeen cells, no strays. Anything that is not a cell is not a skill.

  it('gives the father one plain swing at each weight and no colour at all', () => {
    const skills = learnsetOf('dad');
    expect(skills.map((skill) => skill.tier).sort()).toEqual([...TIERS].sort());
    for (const skill of skills) {
      expect(skill.element).toBe('plain');
      expect(skill.stat).toBe('atk');
    }
  });

  it('gives the mother every colour at every weight, and nothing besides', () => {
    const wanted = CASTABLE.flatMap((element) => TIERS.map((tier) => `${element}/${tier}`));
    const held = learnsetOf('mom').map((skill) => `${skill.element}/${skill.tier}`);
    expect(held.sort()).toEqual(wanted.sort());
  });

  it('prices the mother by weight alone, so a colour is never the cheap answer', () => {
    for (const tier of TIERS) {
      const row = learnsetOf('mom').filter((skill) => skill.tier === tier);
      expect(row).toHaveLength(3);
      expect(new Set(row.map((skill) => skill.mpCost)).size).toBe(1);
      expect(new Set(row.map((skill) => skill.power)).size).toBe(1);
    }
  });

  it('gives the daughter a colourless bolt at every weight', () => {
    expect(strikesOf('daughter').map((skill) => skill.tier).sort()).toEqual([...TIERS].sort());
  });

  it('gives her one heal for a single hero and one for everybody', () => {
    const heals = learnsetOf('daughter').filter((skill) => skill.kind === 'heal');
    expect(heals.map((skill) => skill.tier).sort()).toEqual(['normal', 'spread']);
  });

  it('leaves the party no status magic whatsoever', () => {
    // Poison, sleep and the weakening are things that happen TO the party
    // now. The only answer in the bag is an antidote.
    for (const id of PARTY_ORDER) {
      for (const skill of learnsetOf(id)) {
        expect(skill.kind).not.toBe('afflict');
      }
    }
  });
});

describe('the order the grid fills in', () => {
  const levelsByTier = (id: HeroId, tier: SkillTier): number[] =>
    HEROES[id].learnset.filter((entry) => SKILLS[entry.skill].tier === tier).map((e) => e.level);

  /** The colours of one weight, in the order she is taught them. */
  const coloursInLearnOrder = (id: HeroId, tier: SkillTier): string[] =>
    HEROES[id].learnset
      .filter((entry) => SKILLS[entry.skill].tier === tier)
      .sort((a, b) => a.level - b.level)
      .map((entry) => SKILLS[entry.skill].element);

  it('walks the mother through her colours one at a time before any weight is repeated', () => {
    // Three colours arriving together would ask the game's central question —
    // what colour is that thing? — before the player has met enough monsters
    // to know it is being asked.
    expect(new Set(levelsByTier('mom', 'normal')).size).toBe(3);
  });

  it('never hands the mother two spells in the same level-up', () => {
    // Nine cells over nine levels. Three bolts arriving together is three
    // lessons in one breath: the player takes the one they already understand
    // and the other two sit in the tray unread until the run is over.
    const levels = HEROES.mom.learnset.map((entry) => entry.level);
    expect(new Set(levels).size).toBe(levels.length);
  });

  it('walks each of her weights through the colours one at a time too', () => {
    for (const tier of TIERS) {
      expect(new Set(levelsByTier('mom', tier)).size).toBe(3);
    }
  });

  it('never makes the same colour wait in the same place twice', () => {
    // A colour that is third in every weight is the one the player never gets
    // to swing hard: they meet heavy fire and heavy water two levels before
    // they can answer a leaf monster with either. Each colour opens one weight
    // and closes another, so the wait is shared out instead of always landing
    // on the same one.
    const orders = TIERS.map((tier) => coloursInLearnOrder('mom', tier));
    for (let slot = 0; slot < CASTABLE.length; slot += 1) {
      expect(new Set(orders.map((order) => order[slot])).size).toBe(CASTABLE.length);
    }
  });

  it('never opens a weight on the mother before the father has it', () => {
    // He is the ruler: an unbendable number the coloured ones are read
    // against. Meeting a heavy bolt before ever seeing a heavy swing would
    // leave the player nothing to measure it with.
    for (const tier of TIERS) {
      expect(Math.min(...levelsByTier('dad', tier))).toBeLessThanOrEqual(
        Math.min(...levelsByTier('mom', tier))
      );
    }
  });

  it('finishes every tray inside a run rather than at the level cap', () => {
    // A campaign lands somewhere around level 10 or 11. A skill taught at 12
    // is a skill written down and never cast.
    for (const id of PARTY_ORDER) {
      for (const entry of HEROES[id].learnset) {
        expect(entry.level).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe('createParty', () => {
  it('starts everyone at level 1, whole and unafflicted', () => {
    for (const hero of createParty()) {
      expect(hero.level).toBe(1);
      expect(hero.exp).toBe(0);
      expect(hero.statuses).toEqual([]);
      const stats = heroStats(hero);
      expect(hero.hp).toBe(stats.maxHp);
      expect(hero.mp).toBe(stats.maxMp);
    }
  });

  it('hands out a fresh party each time', () => {
    const first = createParty();
    first[0].hp = 1;
    expect(createParty()[0].hp).toBeGreaterThan(1);
  });
});

describe('learnedSkills', () => {
  it('knows only the level-1 skill at level 1', () => {
    expect(learnedSkills(dad())).toEqual(['hew']);
  });

  it('accumulates as the level climbs', () => {
    const hero: Hero = { ...dad(), level: MAX_LEVEL };
    expect(learnedSkills(hero)).toEqual(HEROES.dad.learnset.map((e) => e.skill));
  });

  it('lists skills in the order they were learned, so the tray never reshuffles', () => {
    const hero: Hero = { ...dad(), level: 6 };
    const learned = learnedSkills(hero);
    expect(learned[0]).toBe('hew');
    expect(learned).toContain('crush');
  });
});

describe('isAlive', () => {
  it('is a question about HP and nothing else', () => {
    expect(isAlive({ ...dad(), hp: 1 })).toBe(true);
    expect(isAlive({ ...dad(), hp: 0 })).toBe(false);
  });
});

describe('awardExp', () => {
  it('banks EXP without levelling when the total is short', () => {
    const { hero, leveledTo, learned } = awardExp(dad(), 5);
    expect(hero.exp).toBe(5);
    expect(hero.level).toBe(1);
    expect(leveledTo).toBeNull();
    expect(learned).toEqual([]);
  });

  it('levels up on crossing the threshold and says so', () => {
    const { hero, leveledTo } = awardExp(dad(), expToReach(2));
    expect(hero.level).toBe(2);
    expect(leveledTo).toBe(2);
  });

  it('grants the new maximum as real HP, not just a bigger empty bar', () => {
    const before = dad();
    const beforeMax = heroStats(before).maxHp;
    const { hero } = awardExp(before, expToReach(2));
    const afterMax = heroStats(hero).maxHp;
    expect(afterMax).toBeGreaterThan(beforeMax);
    expect(hero.hp).toBe(before.hp + (afterMax - beforeMax));
  });

  it('does not heal the wounded back to full', () => {
    // A rest node has to stay worth walking to.
    const hurt: Hero = { ...dad(), hp: 5 };
    const { hero } = awardExp(hurt, expToReach(2));
    expect(hero.hp).toBeLessThan(heroStats(hero).maxHp);
  });

  it('never raises the fallen by handing them a bigger maximum', () => {
    const down: Hero = { ...dad(), hp: 0 };
    const { hero } = awardExp(down, expToReach(3));
    expect(hero.hp).toBe(0);
    expect(isAlive(hero)).toBe(false);
  });

  it('reports every skill learned, including several levels at once', () => {
    const { hero, learned } = awardExp(dad(), expToReach(4));
    expect(hero.level).toBe(4);
    expect(learned).toContain('crush');
  });

  it('stops levelling at the cap but still banks the EXP', () => {
    const capped: Hero = { ...dad(), level: MAX_LEVEL, exp: expToReach(MAX_LEVEL) };
    const { hero, leveledTo } = awardExp(capped, 99999);
    expect(hero.level).toBe(MAX_LEVEL);
    expect(leveledTo).toBeNull();
    expect(hero.exp).toBeGreaterThan(capped.exp);
  });

  it('leaves the hero it was given alone', () => {
    const before = dad();
    awardExp(before, 500);
    expect(before.exp).toBe(0);
  });
});

describe('reviveAfterVictory', () => {
  it('brings the fallen back on their feet but barely', () => {
    const down: Hero = { ...dad(), hp: 0 };
    const revived = reviveAfterVictory(down);
    expect(revived.hp).toBe(Math.max(1, Math.round(heroStats(down).maxHp * REVIVE_FRACTION)));
    expect(isAlive(revived)).toBe(true);
  });

  it('clears whatever was stuck to them when they went down', () => {
    const down: Hero = { ...dad(), hp: 0, statuses: [{ kind: 'poison', turns: 3 }] };
    expect(reviveAfterVictory(down).statuses).toEqual([]);
  });

  it('leaves a survivor exactly as they were', () => {
    const hurt: Hero = { ...dad(), hp: 3, statuses: [{ kind: 'poison', turns: 2 }] };
    expect(reviveAfterVictory(hurt)).toEqual(hurt);
  });
});

describe('restHero', () => {
  it('restores body, magic and mind', () => {
    const wrecked: Hero = {
      ...dad(),
      hp: 1,
      mp: 0,
      statuses: [{ kind: 'poison', turns: 5 }],
    };
    const rested = restHero(wrecked);
    const stats = heroStats(rested);
    expect(rested.hp).toBe(stats.maxHp);
    expect(rested.mp).toBe(stats.maxMp);
    expect(rested.statuses).toEqual([]);
  });

  it('picks the fallen up too', () => {
    expect(isAlive(restHero({ ...dad(), hp: 0 }))).toBe(true);
  });
});

describe('shrine bonuses', () => {
  it('lifts the stat it names and leaves the rest alone', () => {
    const plain = dad();
    const blessed: Hero = { ...plain, bonus: { maxHp: 12 } };
    expect(heroStats(blessed).maxHp).toBe(heroStats(plain).maxHp + 12);
    expect(heroStats(blessed).atk).toBe(heroStats(plain).atk);
  });

  it('survives a level up without being paid out twice', () => {
    // The level-up HP grant is a difference of two stat blocks. If one side
    // counted the bonus and the other did not, every level would re-award it.
    const blessed: Hero = { ...dad(), bonus: { maxHp: 12 } };
    const beforeMax = heroStats(blessed).maxHp;
    const { hero } = awardExp(blessed, expToReach(2));
    expect(heroStats(hero).maxHp).toBe(beforeMax + HEROES.dad.growth.maxHp);
    expect(hero.hp).toBe(blessed.hp + HEROES.dad.growth.maxHp);
  });
});
