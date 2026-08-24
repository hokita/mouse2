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

const vanguard = () => createParty()[0];

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

  it('gives each hero a distinct sigil, since the sigil is their whole name', () => {
    const sigils = PARTY_ORDER.map((id) => HEROES[id].sigil);
    expect(new Set(sigils).size).toBe(3);
  });

  it('makes the three genuinely different rather than differently painted', () => {
    const stats = PARTY_ORDER.map((id) => HEROES[id].base);
    expect(new Set(stats.map((s) => s.maxHp)).size).toBe(3);
    // The Vanguard is the wall, the Caster is the artillery.
    expect(HEROES.vanguard.base.maxHp).toBeGreaterThan(HEROES.caster.base.maxHp);
    expect(HEROES.caster.base.mag).toBeGreaterThan(HEROES.vanguard.base.mag);
    // The Warden is quick, so a heal can beat the blow it answers.
    expect(HEROES.warden.base.spd).toBeGreaterThan(HEROES.vanguard.base.spd);
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
    expect(learnedSkills(vanguard())).toEqual(['ember']);
  });

  it('accumulates as the level climbs', () => {
    const hero: Hero = { ...vanguard(), level: MAX_LEVEL };
    expect(learnedSkills(hero)).toEqual(HEROES.vanguard.learnset.map((e) => e.skill));
  });

  it('lists skills in the order they were learned, so the tray never reshuffles', () => {
    const hero: Hero = { ...vanguard(), level: 6 };
    const learned = learnedSkills(hero);
    expect(learned[0]).toBe('ember');
    expect(learned).toContain('cleave');
  });
});

describe('isAlive', () => {
  it('is a question about HP and nothing else', () => {
    expect(isAlive({ ...vanguard(), hp: 1 })).toBe(true);
    expect(isAlive({ ...vanguard(), hp: 0 })).toBe(false);
  });
});

describe('awardExp', () => {
  it('banks EXP without levelling when the total is short', () => {
    const { hero, leveledTo, learned } = awardExp(vanguard(), 5);
    expect(hero.exp).toBe(5);
    expect(hero.level).toBe(1);
    expect(leveledTo).toBeNull();
    expect(learned).toEqual([]);
  });

  it('levels up on crossing the threshold and says so', () => {
    const { hero, leveledTo } = awardExp(vanguard(), expToReach(2));
    expect(hero.level).toBe(2);
    expect(leveledTo).toBe(2);
  });

  it('grants the new maximum as real HP, not just a bigger empty bar', () => {
    const before = vanguard();
    const beforeMax = heroStats(before).maxHp;
    const { hero } = awardExp(before, expToReach(2));
    const afterMax = heroStats(hero).maxHp;
    expect(afterMax).toBeGreaterThan(beforeMax);
    expect(hero.hp).toBe(before.hp + (afterMax - beforeMax));
  });

  it('does not heal the wounded back to full', () => {
    // A rest node has to stay worth walking to.
    const hurt: Hero = { ...vanguard(), hp: 5 };
    const { hero } = awardExp(hurt, expToReach(2));
    expect(hero.hp).toBeLessThan(heroStats(hero).maxHp);
  });

  it('never raises the fallen by handing them a bigger maximum', () => {
    const down: Hero = { ...vanguard(), hp: 0 };
    const { hero } = awardExp(down, expToReach(3));
    expect(hero.hp).toBe(0);
    expect(isAlive(hero)).toBe(false);
  });

  it('reports every skill learned, including two levels at once', () => {
    const { hero, learned } = awardExp(vanguard(), expToReach(3));
    expect(hero.level).toBe(3);
    expect(learned).toContain('cleave');
  });

  it('stops levelling at the cap but still banks the EXP', () => {
    const capped: Hero = { ...vanguard(), level: MAX_LEVEL, exp: expToReach(MAX_LEVEL) };
    const { hero, leveledTo } = awardExp(capped, 99999);
    expect(hero.level).toBe(MAX_LEVEL);
    expect(leveledTo).toBeNull();
    expect(hero.exp).toBeGreaterThan(capped.exp);
  });

  it('leaves the hero it was given alone', () => {
    const before = vanguard();
    awardExp(before, 500);
    expect(before.exp).toBe(0);
  });
});

describe('reviveAfterVictory', () => {
  it('brings the fallen back on their feet but barely', () => {
    const down: Hero = { ...vanguard(), hp: 0 };
    const revived = reviveAfterVictory(down);
    expect(revived.hp).toBe(Math.max(1, Math.round(heroStats(down).maxHp * REVIVE_FRACTION)));
    expect(isAlive(revived)).toBe(true);
  });

  it('clears whatever was stuck to them when they went down', () => {
    const down: Hero = { ...vanguard(), hp: 0, statuses: [{ kind: 'poison', turns: 3 }] };
    expect(reviveAfterVictory(down).statuses).toEqual([]);
  });

  it('leaves a survivor exactly as they were', () => {
    const hurt: Hero = { ...vanguard(), hp: 3, statuses: [{ kind: 'poison', turns: 2 }] };
    expect(reviveAfterVictory(hurt)).toEqual(hurt);
  });
});

describe('restHero', () => {
  it('restores body, magic and mind', () => {
    const wrecked: Hero = {
      ...vanguard(),
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
    expect(isAlive(restHero({ ...vanguard(), hp: 0 }))).toBe(true);
  });
});

describe('shrine bonuses', () => {
  it('lifts the stat it names and leaves the rest alone', () => {
    const plain = vanguard();
    const blessed: Hero = { ...plain, bonus: { maxHp: 12 } };
    expect(heroStats(blessed).maxHp).toBe(heroStats(plain).maxHp + 12);
    expect(heroStats(blessed).atk).toBe(heroStats(plain).atk);
  });

  it('survives a level up without being paid out twice', () => {
    // The level-up HP grant is a difference of two stat blocks. If one side
    // counted the bonus and the other did not, every level would re-award it.
    const blessed: Hero = { ...vanguard(), bonus: { maxHp: 12 } };
    const beforeMax = heroStats(blessed).maxHp;
    const { hero } = awardExp(blessed, expToReach(2));
    expect(heroStats(hero).maxHp).toBe(beforeMax + HEROES.vanguard.growth.maxHp);
    expect(hero.hp).toBe(blessed.hp + HEROES.vanguard.growth.maxHp);
  });
});
