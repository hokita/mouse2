import { describe, expect, it } from 'vitest';
import { BOSS_ID, ENEMIES, ENEMY_IDS, encounterFor, isElite } from '../enemies';
import { CASTABLE, affinityOf, isCastable } from '../elements';
import { SKILLS } from '../skills';
import { createRng } from '../rng';
import { elementsAtLevel } from '../party';

describe('the bestiary', () => {
  it('keys every entry by its own id', () => {
    for (const id of ENEMY_IDS) {
      expect(ENEMIES[id].id).toBe(id);
    }
  });

  it('reads every affinity off the triangle rather than writing it down', () => {
    // The badge in the corner of the fight is drawn from the cycle. If a
    // monster could state an affinity by hand it could contradict the badge,
    // and a diagram that lies about the rules is worse than no diagram.
    for (const id of ENEMY_IDS) {
      expect(ENEMIES[id].affinity).toEqual(affinityOf(ENEMIES[id].element));
    }
  });

  it('gives every monster a weakness, because the weakness is the puzzle', () => {
    // A monster with no weakness has nothing to teach and no wrong answer.
    for (const id of ENEMY_IDS) {
      expect(ENEMIES[id].affinity.weak).toBeTruthy();
    }
  });

  it('never makes a monster resist what it is weak to', () => {
    for (const id of ENEMY_IDS) {
      const { weak, resist } = ENEMIES[id].affinity;
      expect(weak).not.toBe(resist);
    }
  });

  it('paints all three colours somewhere in the bestiary', () => {
    // A colour no monster wears is a third of the badge that never comes up,
    // and a bolt the player has no reason to have learned.
    const worn = new Set(ENEMY_IDS.map((id) => ENEMIES[id].element));
    for (const element of CASTABLE) {
      expect(worn.has(element)).toBe(true);
    }
  });

  it('never lets a monster cast a colour it is not', () => {
    // A monster is painted its own element, so a bolt of some other colour
    // coming out of it would be the one thing on screen contradicting the
    // colour it is drawn in.
    for (const id of ENEMY_IDS) {
      for (const move of ENEMIES[id].moves) {
        const { element } = SKILLS[move];
        if (isCastable(element)) {
          expect(element).toBe(ENEMIES[id].element);
        }
      }
    }
  });

  it('gives every monster at least one move it can afford at full MP', () => {
    for (const id of ENEMY_IDS) {
      const enemy = ENEMIES[id];
      expect(enemy.moves.length).toBeGreaterThan(0);
      const affordable = enemy.moves.filter((move) => SKILLS[move].mpCost <= enemy.stats.maxMp);
      expect(affordable.length).toBeGreaterThan(0);
    }
  });

  it('never gives a monster a move that would heal the party', () => {
    for (const id of ENEMY_IDS) {
      for (const move of ENEMIES[id].moves) {
        expect(['oneAlly', 'allAllies']).not.toContain(SKILLS[move].target);
      }
    }
  });

  it('pays out more for the deeper tiers', () => {
    const byTier = (tier: number) =>
      ENEMY_IDS.filter((id) => ENEMIES[id].tier === tier).map((id) => ENEMIES[id].exp);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(byTier(2))).toBeGreaterThan(avg(byTier(1)));
    expect(avg(byTier(3))).toBeGreaterThan(avg(byTier(2)));
  });

  it('gets tougher with every tier', () => {
    const hp = (tier: number) =>
      ENEMY_IDS.filter((id) => ENEMIES[id].tier === tier).map((id) => ENEMIES[id].stats.maxHp);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(hp(2))).toBeGreaterThan(avg(hp(1)));
    expect(avg(hp(3))).toBeGreaterThan(avg(hp(2)));
  });

  it('has exactly one boss, and it is the biggest thing in the game', () => {
    const bosses = ENEMY_IDS.filter((id) => ENEMIES[id].tier === 4);
    expect(bosses).toEqual([BOSS_ID]);
    const others = ENEMY_IDS.filter((id) => id !== BOSS_ID).map((id) => ENEMIES[id].stats.maxHp);
    expect(ENEMIES[BOSS_ID].stats.maxHp).toBeGreaterThan(Math.max(...others));
  });
});

describe('encounterFor', () => {
  it('draws from the requested tier only', () => {
    const rng = createRng(1);
    for (let i = 0; i < 40; i += 1) {
      for (const enemy of encounterFor(2, false, rng)) {
        expect(ENEMIES[enemy].tier).toBe(2);
      }
    }
  });

  it('never sends an empty or unfightable crowd', () => {
    const rng = createRng(2);
    for (let i = 0; i < 60; i += 1) {
      const group = encounterFor(1, false, rng);
      expect(group.length).toBeGreaterThanOrEqual(1);
      expect(group.length).toBeLessThanOrEqual(3);
    }
  });

  it('sends the boss alone, so the fight is about one thing', () => {
    expect(encounterFor(4, false, createRng(3))).toEqual([BOSS_ID]);
  });

  it('makes an elite bigger than a plain fight of the same tier', () => {
    const rng = createRng(4);
    const plain = Array.from({ length: 40 }, () => encounterFor(2, false, rng).length);
    const elite = Array.from({ length: 40 }, () => encounterFor(2, true, rng).length);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(elite)).toBeGreaterThan(avg(plain));
  });

  it('is reproducible from a seed', () => {
    expect(encounterFor(3, false, createRng(9))).toEqual(encounterFor(3, false, createRng(9)));
  });
});

describe('the opening fight', () => {
  const atLevelOne = elementsAtLevel(1);

  it('only sends monsters the level-1 party can answer', () => {
    // The one forced battle exists to teach the player to read the triangle.
    // The Wizard starts with water alone, so the opener has to be something
    // water beats — a blob is leaf and shrugs water off, and that fight would
    // have taught the exact opposite of the lesson.
    const rng = createRng(1);
    for (let i = 0; i < 200; i += 1) {
      for (const foe of encounterFor(1, false, rng, atLevelOne)) {
        expect(atLevelOne).toContain(ENEMIES[foe].affinity.weak);
      }
    }
  });

  it('does not narrow any later fight', () => {
    const rng = createRng(2);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      for (const foe of encounterFor(1, false, rng)) {
        seen.add(foe);
      }
    }
    expect(seen.has('wisp')).toBe(true);
  });

  it('leaves the pool alone when nothing would be left of it', () => {
    // A guard against a future learnset that covers no tier-1 weakness at
    // level 1: an empty pool would be worse than an unanswerable monster.
    const group = encounterFor(1, false, createRng(3), []);
    expect(group.length).toBeGreaterThan(0);
  });

  it('is derived from the learnsets rather than written down twice', () => {
    // Level 1 is the Wizard's water and nothing else — the Warrior carries no
    // colour at all now, so the party's whole palette is one bolt deep until
    // she picks up leaf at level 2.
    expect([...atLevelOne].sort()).toEqual(['water']);
    expect(elementsAtLevel(2)).toContain('leaf');
  });
});

describe('isElite', () => {
  it('reads the flag the map sets', () => {
    expect(isElite('elite')).toBe(true);
    expect(isElite('battle')).toBe(false);
  });
});
