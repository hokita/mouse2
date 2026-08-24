import { applyBattleToParty, expReward } from './battle';
import type { BattleState } from './battle';
import { encounterFor } from './enemies';
import type { EnemyId } from './enemies';
import { ITEM_IDS, startingBag } from './items';
import type { Bag, ItemId } from './items';
import { MAP_ROWS, generateMap, nodeAt, optionsFrom } from './nodeMap';
import type { MapNode, NodeMap } from './nodeMap';
import { awardExp, createParty, heroStats, restHero, reviveAfterVictory } from './party';
import type { Hero, HeroId } from './party';
import { createRng, pick, randInt, shuffled } from './rng';
import type { Rng } from './rng';
import type { SkillId } from './skills';
import type { Stats } from './stats';

// One attempt at the campaign, from the first fight to the boss or the wipe.
//
// Nothing here survives the run. There is no save file and no meta-progress,
// which is the same deal every other game in this collection offers: a run is
// a run, and the next one starts clean. That is also what lets the map be
// generated rather than authored — a fresh shape every time is a feature only
// if the player is never asked to remember the last one.

// --- blessings ------------------------------------------------------------

export type BoonId = 'vigor' | 'focus' | 'edge' | 'ward' | 'swift';

export type BoonGlyph = 'heart' | 'spiral' | 'edge' | 'shield' | 'wing';

export interface Boon {
  id: BoonId;
  glyph: BoonGlyph;
  /** Added to every hero, permanently, for the rest of the run. */
  bonus: Partial<Stats>;
}

/**
 * What a shrine offers. Flat numbers rather than percentages, because a
 * percentage is invisible: +12 HP moves a bar by a width the player can see,
 * where +8% moves it by an amount they would have to be told about.
 */
export const BOONS: Record<BoonId, Boon> = {
  vigor: { id: 'vigor', glyph: 'heart', bonus: { maxHp: 12 } },
  focus: { id: 'focus', glyph: 'spiral', bonus: { maxMp: 6 } },
  edge: { id: 'edge', glyph: 'edge', bonus: { atk: 4, mag: 4 } },
  ward: { id: 'ward', glyph: 'shield', bonus: { def: 4 } },
  swift: { id: 'swift', glyph: 'wing', bonus: { spd: 3 } },
};

export const BOON_IDS = Object.keys(BOONS) as BoonId[];

// --- the run --------------------------------------------------------------

export interface RunState {
  seed: number;
  party: Hero[];
  map: NodeMap;
  /** The node the party is standing on. */
  at: number;
  visited: number[];
  bag: Bag;
  bossDown: boolean;
}

export interface LevelUp {
  hero: HeroId;
  level: number;
  learned: SkillId[];
}

export function createRun(seed: number): RunState {
  const map = generateMap(createRng(seed));
  return {
    seed,
    party: createParty(),
    map,
    at: map.startId,
    visited: [],
    bag: startingBag(),
    bossDown: false,
  };
}

export function currentNode(run: RunState): MapNode {
  return nodeAt(run.map, run.at)!;
}

export function optionsFor(run: RunState): MapNode[] {
  return optionsFrom(run.map, run.at);
}

/** Ignores a node the party cannot walk to from where it stands. */
export function travelTo(run: RunState, nodeId: number): RunState {
  if (!optionsFor(run).some((node) => node.id === nodeId)) {
    return run;
  }
  return { ...run, at: nodeId, visited: [...run.visited, nodeId] };
}

export function isVictory(run: RunState): boolean {
  return run.bossDown && run.at === run.map.bossId;
}

/** 0 at the start, 1 at the boss — the only "how far in am I" the game gives. */
export function runProgress(run: RunState): number {
  return currentNode(run).row / (MAP_ROWS - 1);
}

export function encounterAt(node: MapNode, rng: Rng): EnemyId[] {
  return encounterFor(node.tier, node.kind === 'elite', rng);
}

export interface BattleResult {
  run: RunState;
  exp: number;
  levelUps: LevelUp[];
}

/**
 * Takes the party out of a won fight: wounds kept, EXP paid, fallen back up.
 *
 * Reviving here rather than at a rest node is what keeps a bad fight from
 * ending the run by attrition. Losing a hero costs the rest of that battle,
 * which is expensive enough; carrying a corpse into the next one would mean
 * the run was effectively over several fights before the game said so.
 */
export function finishBattle(run: RunState, battle: BattleState, foes: readonly EnemyId[]): BattleResult {
  const exp = expReward(foes);
  const levelUps: LevelUp[] = [];

  const party = applyBattleToParty(run.party, battle).map((hero) => {
    const { hero: paid, leveledTo, learned } = awardExp(hero, exp);
    if (leveledTo !== null) {
      levelUps.push({ hero: hero.id, level: leveledTo, learned });
    }
    return reviveAfterVictory(paid);
  });

  return {
    run: { ...run, party, bag: { ...battle.bag }, bossDown: run.bossDown || foes.includes('crown') },
    exp,
    levelUps,
  };
}

export function takeRest(run: RunState): RunState {
  return { ...run, party: run.party.map(restHero) };
}

export interface TreasureResult {
  run: RunState;
  gained: ItemId[];
}

export function openTreasure(run: RunState, rng: Rng): TreasureResult {
  const gained = Array.from({ length: randInt(rng, 1, 2) }, () => pick(rng, ITEM_IDS));
  const bag: Bag = { ...run.bag };
  for (const item of gained) {
    bag[item] = (bag[item] ?? 0) + 1;
  }
  return { run: { ...run, bag }, gained };
}

/** Three of the five, never repeated — a shrine is a choice, not a slot machine. */
export function shrineOffer(rng: Rng): BoonId[] {
  return shuffled(rng, BOON_IDS).slice(0, 3);
}

/**
 * Applies a blessing to the whole party.
 *
 * Extra maximum HP arrives as real HP too. A blessing that only widened an
 * empty bar would be a reward the player is told about and cannot feel, which
 * in a game with no text means a reward they never learn they took.
 */
export function takeBoon(run: RunState, boon: BoonId): RunState {
  const { bonus } = BOONS[boon];
  return {
    ...run,
    party: run.party.map((hero) => {
      const before = heroStats(hero);
      const next: Hero = {
        ...hero,
        bonus: {
          maxHp: (hero.bonus.maxHp ?? 0) + (bonus.maxHp ?? 0),
          maxMp: (hero.bonus.maxMp ?? 0) + (bonus.maxMp ?? 0),
          atk: (hero.bonus.atk ?? 0) + (bonus.atk ?? 0),
          mag: (hero.bonus.mag ?? 0) + (bonus.mag ?? 0),
          def: (hero.bonus.def ?? 0) + (bonus.def ?? 0),
          spd: (hero.bonus.spd ?? 0) + (bonus.spd ?? 0),
        },
      };
      const after = heroStats(next);
      return {
        ...next,
        hp: hero.hp > 0 ? hero.hp + (after.maxHp - before.maxHp) : hero.hp,
        mp: hero.mp + (after.maxMp - before.maxMp),
      };
    }),
  };
}
