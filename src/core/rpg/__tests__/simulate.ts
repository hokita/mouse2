import {
  activeCombatant,
  createBattle,
  enemyCommand,
  livingFoes,
  livingHeroes,
  takeTurn,
} from '../battle';
import type { BattleState, Combatant, Command } from '../battle';
import type { Element } from '../elements';
import type { EnemyId } from '../enemies';
import { heroStats, learnedSkills } from '../party';
import type { Hero, HeroId } from '../party';
import { createRng, pick } from '../rng';
import type { Rng } from '../rng';
import { SKILLS } from '../skills';
import type { SkillId } from '../skills';
import { hasStatus } from '../status';
import {
  battleSeed,
  createRun,
  currentNode,
  encounterAt,
  encounterSeed,
  finishBattle,
  optionsFor,
  shrineOffer,
  takeBoon,
  takeRest,
  openTreasure,
  travelTo,
} from '../run';
import type { RunState } from '../run';

// A headless player, so the balance of a turn-based campaign can be measured
// instead of guessed at.
//
// This file is not a test. It is the thing the tests point at: an autopilot
// that plays a whole run from a seed, used to ask two questions no amount of
// hand-tuning answers honestly — can the campaign be won, and does reading
// the colours actually matter?

/** No fight should ever need this many turns. Exceeding it is a stalemate. */
const TURN_CEILING = 300;

export type Policy = 'skilled' | 'naive';

const BOLT: Record<Element, SkillId | null> = {
  fire: 'flare',
  water: 'torrent',
  leaf: 'thorn',
  plain: null,
};

const weakest = (crowd: Combatant[]): Combatant =>
  crowd.reduce((low, c) => (c.hp < low.hp ? c : low), crowd[0]);

/**
 * What a competent player does with a hero's turn.
 *
 * The skilled policy is allowed to know every monster's weakness outright.
 * That is deliberately generous — it measures whether the campaign is
 * winnable by someone playing it well, which is the ceiling worth checking.
 * The naive policy only ever swings, and exists to prove by contrast that the
 * elemental system is load-bearing rather than decorative.
 */
function heroCommand(
  state: BattleState,
  actor: Combatant,
  known: Record<HeroId, SkillId[]>,
  policy: Policy,
  rng: Rng
): Command {
  const foes = livingFoes(state);
  const allies = livingHeroes(state);
  const target = weakest(foes).id;

  if (policy === 'naive') {
    return { kind: 'attack', target };
  }

  const skills = known[actor.heroId!].filter((id) => SKILLS[id].mpCost <= actor.mp);
  const has = (id: SkillId) => skills.includes(id);

  // Keep everyone upright first. A wipe is the only way to lose.
  const hurt = allies.filter((a) => a.hp < a.stats.maxHp * 0.45);
  if (hurt.length && actor.heroId === 'daughter' && has('mend')) {
    return { kind: 'skill', skill: 'mend', target: weakest(hurt).id };
  }
  if (hurt.length && (state.bag.potion ?? 0) > 0 && weakest(hurt).hp < weakest(hurt).stats.maxHp * 0.25) {
    return { kind: 'item', item: 'potion', target: weakest(hurt).id };
  }
  if (actor.heroId === 'daughter' && has('cleanse')) {
    const afflicted = allies.find((a) => hasStatus(a.statuses, 'poison') || hasStatus(a.statuses, 'sleep'));
    if (afflicted) {
      return { kind: 'skill', skill: 'cleanse', target: afflicted.id };
    }
  }

  // Then hit the weakness, if this hero has that colour to hand.
  for (const foe of [...foes].sort((a, b) => a.hp - b.hp)) {
    const bolt = foe.affinity.weak ? BOLT[foe.affinity.weak] : null;
    if (bolt && has(bolt)) {
      return { kind: 'skill', skill: bolt, target: foe.id };
    }
  }

  // Otherwise the biggest thing that is not resisted.
  const usable = skills
    .filter((id) => SKILLS[id].kind === 'strike')
    .filter((id) => foes.every((foe) => foe.affinity.resist !== SKILLS[id].element))
    .sort((a, b) => SKILLS[b].power - SKILLS[a].power);
  if (usable.length && foes.length > 1) {
    const spread = usable.find((id) => SKILLS[id].target === 'allFoes');
    if (spread) {
      return { kind: 'skill', skill: spread, target };
    }
  }
  const single = usable.find((id) => SKILLS[id].target === 'oneFoe');
  if (single) {
    return { kind: 'skill', skill: single, target };
  }

  // Out of everything worth spending: swing, and let MP build back at a rest.
  return { kind: 'attack', target: pick(rng, foes).id };
}

export interface FightOutcome {
  state: BattleState;
  turns: number;
  stalemate: boolean;
}

export function simulateBattle(
  party: readonly Hero[],
  foes: readonly EnemyId[],
  bag: BattleState['bag'],
  policy: Policy,
  rng: Rng
): FightOutcome {
  const known = Object.fromEntries(party.map((h) => [h.id, learnedSkills(h)])) as Record<HeroId, SkillId[]>;
  let state = createBattle(party, foes, rng, bag);
  let turns = 0;

  while (state.outcome === 'ongoing' && turns < TURN_CEILING) {
    const actor = activeCombatant(state);
    if (!actor) {
      break;
    }
    const command: Command =
      actor.side === 'foes' ? enemyCommand(state, rng) : heroCommand(state, actor, known, policy, rng);
    const next = takeTurn(state, command, rng);
    // An illegal command hands back the identical state. Falling back to a
    // plain swing keeps a policy bug from spinning here forever.
    state = next.state === state ? takeTurn(state, { kind: 'attack', target: livingFoes(state)[0].id }, rng).state : next.state;
    turns += 1;
  }

  return { state, turns, stalemate: state.outcome === 'ongoing' };
}

export interface RunOutcome {
  won: boolean;
  /** True if any fight failed to resolve inside the turn ceiling. */
  stalemate: boolean;
  fights: number;
  /** Party level at the end, highest of the three. */
  level: number;
  longestFight: number;
}

/** Picks the next node: patch up when hurt, otherwise take what is offered. */
function chooseNext(run: RunState, rng: Rng): number {
  const options = optionsFor(run);
  // Wounded share of the party's total capacity. The denominator has to be
  // maximum HP: summing current HP again makes the ratio identically 1, and
  // the policy then never seeks a rest at all.
  const health =
    run.party.reduce((sum, h) => sum + Math.max(0, h.hp), 0) /
    run.party.reduce((sum, h) => sum + heroStats(h).maxHp, 0);
  if (health < 0.6) {
    const rest = options.find((node) => node.kind === 'rest');
    if (rest) {
      return rest.id;
    }
  }
  return pick(rng, options).id;
}

export function simulateRun(seed: number, policy: Policy = 'skilled'): RunOutcome {
  // Route choice gets its own stream, and every node derives its encounter
  // and its fight from the same seeds QuestScene uses. Sharing one mutable
  // RNG across routing and combat left it at a different position for each
  // policy — because a naive fight takes more turns — so skilled and naive
  // walked different maps and the comparison measured route luck alongside
  // strategy. Now the two differ only where the policy genuinely differs.
  const routeRng = createRng(seed * 31 + 17);
  let run = createRun(seed);
  let fights = 0;
  let longestFight = 0;

  for (let step = 0; step < 40; step += 1) {
    const options = optionsFor(run);
    if (options.length === 0) {
      break;
    }
    run = travelTo(run, chooseNext(run, routeRng));
    const node = currentNode(run);

    switch (node.kind) {
      case 'battle':
      case 'elite':
      case 'boss': {
        const foes = encounterAt(node, createRng(encounterSeed(run, node)));
        const fight = simulateBattle(run.party, foes, run.bag, policy, createRng(battleSeed(run, node)));
        fights += 1;
        longestFight = Math.max(longestFight, fight.turns);
        if (fight.stalemate) {
          return { won: false, stalemate: true, fights, level: 0, longestFight: fight.turns };
        }
        if (fight.state.outcome === 'lost') {
          return {
            won: false,
            stalemate: false,
            fights,
            level: Math.max(...run.party.map((h) => h.level)),
            longestFight,
          };
        }
        run = finishBattle(run, fight.state, foes).run;
        break;
      }
      case 'rest':
        run = takeRest(run);
        break;
      case 'treasure':
        run = openTreasure(run, createRng(encounterSeed(run, node))).run;
        break;
      case 'shrine':
        run = takeBoon(run, shrineOffer(createRng(encounterSeed(run, node)))[0]);
        break;
      default:
        break;
    }
  }

  return {
    won: run.bossDown,
    stalemate: false,
    fights,
    level: Math.max(...run.party.map((h) => h.level)),
    longestFight,
  };
}
