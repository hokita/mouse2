import { levelForExp, statsAtLevel } from './stats';
import type { Stats } from './stats';
import type { SkillId } from './skills';
import type { Status } from './status';

// The three the player runs with. Fixed, never chosen, never recruited: a run
// starts the instant the card is tapped, and a roster screen would put a
// decision in front of a player who has not been told anything yet.
//
// They are told apart by sigil and colour alone. That is a real constraint on
// the design — the difference between them has to be visible in what happens
// when they act, not in a class name, so the three are pushed further apart
// than a text-labelled party would need: the Vanguard is nearly twice the
// Caster's HP, and the Caster nearly three times the Vanguard's magic.

export type HeroId = 'vanguard' | 'caster' | 'warden';

/** The shape drawn on the portrait. Doubles as the character's whole identity. */
export type HeroSigil = 'diamond' | 'star' | 'cross';

export interface LearnEntry {
  level: number;
  skill: SkillId;
}

export interface HeroDef {
  id: HeroId;
  sigil: HeroSigil;
  base: Stats;
  growth: Stats;
  /** Kept in ascending level order — the skill tray is built from it in place. */
  learnset: LearnEntry[];
}

export interface Hero {
  id: HeroId;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  statuses: Status[];
}

/** A hero picked up after a won fight comes back on their feet, but only just. */
export const REVIVE_FRACTION = 0.3;

export const HEROES: Record<HeroId, HeroDef> = {
  vanguard: {
    id: 'vanguard',
    sigil: 'diamond',
    base: { maxHp: 46, maxMp: 8, atk: 15, mag: 4, def: 12, spd: 8 },
    growth: { maxHp: 7, maxMp: 1, atk: 2, mag: 1, def: 2, spd: 1 },
    learnset: [
      { level: 1, skill: 'ember' },
      { level: 3, skill: 'cleave' },
      { level: 6, skill: 'daunt' },
      { level: 9, skill: 'crush' },
    ],
  },
  caster: {
    id: 'caster',
    sigil: 'star',
    base: { maxHp: 30, maxMp: 16, atk: 6, mag: 16, def: 6, spd: 10 },
    growth: { maxHp: 4, maxMp: 3, atk: 1, mag: 3, def: 1, spd: 1 },
    // The three bolts arrive one at a time rather than together. Handing over
    // all three colours at once would present the game's central question
    // before the player has met enough monsters to know it is being asked.
    learnset: [
      { level: 1, skill: 'frost' },
      { level: 2, skill: 'spark' },
      { level: 4, skill: 'flare' },
      { level: 5, skill: 'lull' },
      { level: 8, skill: 'storm' },
    ],
  },
  warden: {
    id: 'warden',
    sigil: 'cross',
    base: { maxHp: 36, maxMp: 14, atk: 8, mag: 12, def: 8, spd: 12 },
    growth: { maxHp: 5, maxMp: 3, atk: 1, mag: 2, def: 1, spd: 2 },
    learnset: [
      { level: 1, skill: 'mend' },
      { level: 2, skill: 'venom' },
      { level: 4, skill: 'cleanse' },
      { level: 6, skill: 'bloom' },
      { level: 9, skill: 'chorus' },
    ],
  },
};

/** Front to back, and the order the portraits stack up the screen. */
export const PARTY_ORDER: HeroId[] = ['vanguard', 'caster', 'warden'];

export function heroStats(hero: Hero): Stats {
  const def = HEROES[hero.id];
  return statsAtLevel(def.base, def.growth, hero.level);
}

export function learnedSkills(hero: Hero): SkillId[] {
  return HEROES[hero.id].learnset
    .filter((entry) => entry.level <= hero.level)
    .map((entry) => entry.skill);
}

export function isAlive(hero: Hero): boolean {
  return hero.hp > 0;
}

export function createParty(): Hero[] {
  return PARTY_ORDER.map((id) => {
    const stats = statsAtLevel(HEROES[id].base, HEROES[id].growth, 1);
    return { id, level: 1, exp: 0, hp: stats.maxHp, mp: stats.maxMp, statuses: [] };
  });
}

export interface ExpResult {
  hero: Hero;
  /** The new level, or null if none was gained. */
  leveledTo: number | null;
  /** Skills unlocked by this award, in learn order. */
  learned: SkillId[];
}

/**
 * Banks EXP and applies any levels it buys.
 *
 * The fallen are paid too. Withholding EXP from a downed hero is the classic
 * rule, but over a fifteen-fight campaign it compounds: the character who
 * went down once falls behind, goes down more easily next time, and the run
 * unravels for a reason the player was never shown. Being out of a fight is
 * penalty enough.
 *
 * A level raises the ceiling and gives that much real HP, but never tops
 * anyone up. Otherwise levelling would quietly do the rest node's job and
 * there would be no reason to route the map towards one.
 */
export function awardExp(hero: Hero, amount: number): ExpResult {
  const exp = hero.exp + amount;
  const level = levelForExp(exp);

  if (level === hero.level) {
    return { hero: { ...hero, exp }, leveledTo: null, learned: [] };
  }

  const before = heroStats(hero);
  const after = statsAtLevel(HEROES[hero.id].base, HEROES[hero.id].growth, level);
  // Guard the fallen: adding the new maximum to a hero at 0 HP would stand
  // them back up mid-battle, out of nowhere, with no animation to explain it.
  const standing = isAlive(hero);

  return {
    hero: {
      ...hero,
      exp,
      level,
      hp: standing ? hero.hp + (after.maxHp - before.maxHp) : hero.hp,
      mp: hero.mp + (after.maxMp - before.maxMp),
    },
    leveledTo: level,
    learned: HEROES[hero.id].learnset
      .filter((entry) => entry.level > hero.level && entry.level <= level)
      .map((entry) => entry.skill),
  };
}

/** After a won fight the fallen get up — wounded, clean, and in the next fight. */
export function reviveAfterVictory(hero: Hero): Hero {
  if (isAlive(hero)) {
    return hero;
  }
  return {
    ...hero,
    hp: Math.max(1, Math.round(heroStats(hero).maxHp * REVIVE_FRACTION)),
    statuses: [],
  };
}

/** What a rest node gives: everything back. */
export function restHero(hero: Hero): Hero {
  const stats = heroStats(hero);
  return { ...hero, hp: stats.maxHp, mp: stats.maxMp, statuses: [] };
}
