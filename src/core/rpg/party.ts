import { levelForExp, statsAtLevel } from './stats';
import type { Stats } from './stats';
import { SKILLS } from './skills';
import type { SkillId } from './skills';
import type { Status } from './status';
import type { Element } from './elements';

// The three the player runs with. Fixed, never chosen, never recruited: a run
// starts the instant the card is tapped, and a roster screen would put a
// decision in front of a player who has not been told anything yet.
//
// A family: the daughter who leads, her father who hits, her mother who
// casts. They are told apart by their faces and by what happens when they
// act — never by a class name, because there is nowhere to write one. So the
// three are pushed further apart than a text-labelled party would need: the
// father is nearly twice the mother's HP, and the mother nearly three times
// his magic. The daughter sits between them and carries the two things
// neither of her parents has: untyped magic, and every heal in the game.

export type HeroId = 'dad' | 'mom' | 'daughter';

export interface LearnEntry {
  level: number;
  skill: SkillId;
}

export interface HeroDef {
  id: HeroId;
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
  /**
   * Permanent gains banked from shrines, on top of the level curve.
   *
   * Kept separate from `level` rather than folded into it so a shrine is not
   * silently competing with a fight for the same reward. The player who
   * routes past three shrines and the player who routes past three elites
   * both get stronger, in visibly different ways.
   */
  bonus: Partial<Stats>;
}

/** A hero picked up after a won fight comes back on their feet, but only just. */
export const REVIVE_FRACTION = 0.3;

export const HEROES: Record<HeroId, HeroDef> = {
  daughter: {
    id: 'daughter',
    base: { maxHp: 36, maxMp: 14, atk: 8, mag: 12, def: 8, spd: 12 },
    growth: { maxHp: 5, maxMp: 3, atk: 1, mag: 2, def: 1, spd: 2 },
    // Heal first, then the bolt that always lands the same. She is the only
    // hero who can answer a monster whose colour the player has not worked
    // out yet, and the only one who can put anybody back up.
    learnset: [
      { level: 1, skill: 'mend' },
      { level: 2, skill: 'force' },
      { level: 5, skill: 'nova' },
      { level: 6, skill: 'chorus' },
      { level: 9, skill: 'pulse' },
    ],
  },
  dad: {
    id: 'dad',
    base: { maxHp: 46, maxMp: 10, atk: 18, mag: 4, def: 12, spd: 8 },
    growth: { maxHp: 7, maxMp: 2, atk: 3, mag: 1, def: 2, spd: 1 },
    // He reaches each weight first. His damage is the one number in the game
    // that never bends, so a player meeting a heavy bolt has already held a
    // heavy swing to measure it against.
    learnset: [
      { level: 1, skill: 'hew' },
      { level: 4, skill: 'crush' },
      { level: 7, skill: 'cleave' },
    ],
  },
  mom: {
    id: 'mom',
    base: { maxHp: 30, maxMp: 16, atk: 6, mag: 16, def: 6, spd: 10 },
    growth: { maxHp: 4, maxMp: 3, atk: 1, mag: 3, def: 1, spd: 1 },
    // Her nine cells arrive one per level, from 1 to 9, and never two at once.
    //
    // Three bolts landing on the same level-up is three lessons in one breath.
    // The player casts whichever one they already understand and the other two
    // sit in the tray unread, so a weight taught all at once is really a weight
    // taught late. One at a time means every level-up hands her exactly one new
    // thing, and there is a fight to try it in before the next arrives.
    //
    // Water first, and that order is not free: the one forced opening fight
    // draws from monsters the level-1 party can actually answer, and at level
    // 1 her single bolt IS the party's whole palette.
    //
    // The colour that goes last in one weight does not go last in the next, so
    // no colour is the one the player never gets to swing hard.
    learnset: [
      { level: 1, skill: 'torrent' },
      { level: 2, skill: 'thorn' },
      { level: 3, skill: 'flare' },
      { level: 4, skill: 'deluge' },
      { level: 5, skill: 'blaze' },
      { level: 6, skill: 'bramble' },
      { level: 7, skill: 'flood' },
      { level: 8, skill: 'wildfire' },
      { level: 9, skill: 'thicket' },
    ],
  },
};

/** Front to back, and the order the portraits stack up the screen. */
export const PARTY_ORDER: HeroId[] = ['daughter', 'dad', 'mom'];

export function heroStats(hero: Hero): Stats {
  const def = HEROES[hero.id];
  const leveled = statsAtLevel(def.base, def.growth, hero.level);
  const bonus = hero.bonus;
  return {
    maxHp: leveled.maxHp + (bonus.maxHp ?? 0),
    maxMp: leveled.maxMp + (bonus.maxMp ?? 0),
    atk: leveled.atk + (bonus.atk ?? 0),
    mag: leveled.mag + (bonus.mag ?? 0),
    def: leveled.def + (bonus.def ?? 0),
    spd: leveled.spd + (bonus.spd ?? 0),
  };
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
    return { id, level: 1, exp: 0, hp: stats.maxHp, mp: stats.maxMp, statuses: [], bonus: {} };
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
  const after = heroStats({ ...hero, level });
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

/**
 * Which elements the party can actually bring to bear at `level`.
 *
 * Derived from the learnsets rather than written down, so it cannot drift
 * when a skill moves up or down the curve. Used to keep the opening fight
 * answerable: the Wizard's colours arrive one at a time and the Warrior
 * brings none, so at level 1 the party holds fire and nothing else.
 */
export function elementsAtLevel(level: number): Element[] {
  const elements = new Set<Element>();
  for (const def of Object.values(HEROES)) {
    for (const entry of def.learnset) {
      const skill = SKILLS[entry.skill];
      if (entry.level <= level && skill.kind === 'strike' && skill.element !== 'plain') {
        elements.add(skill.element);
      }
    }
  }
  return [...elements];
}
