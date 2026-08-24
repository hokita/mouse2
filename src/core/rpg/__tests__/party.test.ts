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
import { SKILLS } from '../skills';

const dad = () => createParty().find((h) => h.id === 'dad')!;

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

  it('hits harder per cast than the Wizard does on a colour she got wrong', () => {
    // The trade has to be real in both directions, or untyped is just worse.
    const wrong = SKILLS.flare.power * 0.5;
    const untyped = HEROES.daughter.learnset
      .map((entry) => SKILLS[entry.skill])
      .filter((skill) => skill.kind === 'strike');
    for (const skill of untyped) {
      expect(skill.power).toBeGreaterThan(wrong);
      expect(skill.power).toBeLessThan(SKILLS.flare.power * 1.75);
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
    expect(learnedSkills(dad())).toEqual(['ember']);
  });

  it('accumulates as the level climbs', () => {
    const hero: Hero = { ...dad(), level: MAX_LEVEL };
    expect(learnedSkills(hero)).toEqual(HEROES.dad.learnset.map((e) => e.skill));
  });

  it('lists skills in the order they were learned, so the tray never reshuffles', () => {
    const hero: Hero = { ...dad(), level: 6 };
    const learned = learnedSkills(hero);
    expect(learned[0]).toBe('ember');
    expect(learned).toContain('cleave');
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

  it('reports every skill learned, including two levels at once', () => {
    const { hero, learned } = awardExp(dad(), expToReach(3));
    expect(hero.level).toBe(3);
    expect(learned).toContain('cleave');
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
