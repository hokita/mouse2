import { computeDamage, computeHeal } from './damage';
import type { Element } from './elements';
import type { AffinityBand, Affinity } from './elements';
import { ENEMIES } from './enemies';
import type { EnemyId } from './enemies';
import { ITEMS, startingBag } from './items';
import type { Bag, ItemId } from './items';
import { heroStats } from './party';
import type { Hero, HeroId } from './party';
import { chance, pick } from './rng';
import type { Rng } from './rng';
import { SKILLS, isSpread } from './skills';
import type { Skill, SkillId } from './skills';
import {
  applyStatus,
  attackMultiplier,
  cureAilments,
  hasStatus,
  resolveTurnEnd,
  wakeOnDamage,
} from './status';
import type { Status, StatusKind } from './status';
import type { Stats } from './stats';
import { buildTurnOrder } from './turnOrder';

// The fight, as a state machine with no opinions about pixels.
//
// The scene's job is to render `BattleState` and hand back one `Command` per
// hero turn; everything else happens here. The two halves talk through
// `BattleEvent[]` — a flat list of what just happened, in the order it
// happened — because a wordless game has to animate each beat one at a time.
// A scene that could only see before-and-after state would have to diff two
// snapshots to work out whether that missing HP was a sword or a poison tick,
// and the two look nothing alike on screen.

export type Side = 'party' | 'foes';

export interface Combatant {
  /** `hero:<id>` or `foe:<index>`. Stable for the life of the battle. */
  id: string;
  side: Side;
  hp: number;
  mp: number;
  stats: Stats;
  affinity: Affinity;
  statuses: Status[];
  /** Halves what lands, until this combatant's next turn comes round. */
  guarding: boolean;
  /** Set on heroes — which portrait to draw. */
  heroId?: HeroId;
  /** Set on monsters — which silhouette to draw. */
  enemyId?: EnemyId;
}

export type Outcome = 'ongoing' | 'won' | 'lost';

export interface BattleState {
  combatants: Combatant[];
  /** Still to act this round, in order. `order[0]` is up now. */
  order: string[];
  round: number;
  outcome: Outcome;
  bag: Bag;
}

export type Command =
  | { kind: 'attack'; target: string }
  | { kind: 'skill'; skill: SkillId; target?: string }
  | { kind: 'guard' }
  | { kind: 'item'; item: ItemId; target?: string };

export type BattleEvent =
  | { type: 'act'; actor: string; skill?: SkillId; item?: ItemId }
  | { type: 'damage'; target: string; amount: number; band: AffinityBand; element: Element }
  | { type: 'heal'; target: string; amount: number }
  | { type: 'mp'; target: string; amount: number }
  | { type: 'status'; target: string; status: StatusKind }
  | { type: 'statusFailed'; target: string; status: StatusKind }
  | { type: 'statusExpired'; target: string; status: StatusKind }
  // `cleared` is what actually came off. A cure that found nothing is still
  // a legal, MP-spending turn, and the scene needs to be able to say so
  // rather than draw nothing at all.
  | { type: 'cured'; target: string; cleared: StatusKind[] }
  | { type: 'guard'; actor: string }
  | { type: 'asleep'; actor: string }
  | { type: 'down'; target: string }
  | { type: 'outcome'; outcome: 'won' | 'lost' };

// --- reading the field ----------------------------------------------------

export function findCombatant(state: BattleState, id: string): Combatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

export function livingHeroes(state: BattleState): Combatant[] {
  return state.combatants.filter((c) => c.side === 'party' && c.hp > 0);
}

export function livingFoes(state: BattleState): Combatant[] {
  return state.combatants.filter((c) => c.side === 'foes' && c.hp > 0);
}

export function activeCombatant(state: BattleState): Combatant | undefined {
  return state.order.length ? findCombatant(state, state.order[0]) : undefined;
}

/** False while the active combatant is asleep — the scene shows no menu. */
export function canAct(state: BattleState): boolean {
  const actor = activeCombatant(state);
  return state.outcome === 'ongoing' && !!actor && !hasStatus(actor.statuses, 'sleep');
}

// --- setting up -----------------------------------------------------------

export function createBattle(
  party: readonly Hero[],
  foes: readonly EnemyId[],
  rng: Rng,
  bag: Bag = startingBag()
): BattleState {
  const heroes: Combatant[] = party.map((hero) => ({
    id: `hero:${hero.id}`,
    side: 'party',
    hp: hero.hp,
    mp: hero.mp,
    stats: heroStats(hero),
    affinity: {},
    statuses: [...hero.statuses],
    guarding: false,
    heroId: hero.id,
  }));

  // Indexed rather than named, so two of the same species are still two
  // separate things the player can aim at.
  const monsters: Combatant[] = foes.map((enemyId, index) => ({
    id: `foe:${index}`,
    side: 'foes',
    hp: ENEMIES[enemyId].stats.maxHp,
    mp: ENEMIES[enemyId].stats.maxMp,
    stats: ENEMIES[enemyId].stats,
    affinity: ENEMIES[enemyId].affinity,
    statuses: [],
    guarding: false,
    enemyId,
  }));

  const combatants = [...heroes, ...monsters];
  return {
    combatants,
    order: buildTurnOrder(
      combatants.map((c) => ({ id: c.id, spd: c.stats.spd, alive: c.hp > 0 })),
      rng
    ),
    round: 1,
    outcome: 'ongoing',
    bag: { ...bag },
  };
}

// --- taking a turn --------------------------------------------------------

/** Working copy for one turn's worth of resolution. */
interface Draft {
  combatants: Combatant[];
  events: BattleEvent[];
  bag: Bag;
}

function get(draft: Draft, id: string): Combatant {
  return draft.combatants.find((c) => c.id === id)!;
}

function hurt(draft: Draft, target: Combatant, amount: number, band: AffinityBand, element: Element): void {
  target.hp = Math.max(0, target.hp - amount);
  draft.events.push({ type: 'damage', target: target.id, amount, band, element });
  // Being hit is the one thing that always breaks sleep. Without it, sleep is
  // a stun, and a stun the player cannot answer is not a fight.
  target.statuses = wakeOnDamage(target.statuses);
}

function mend(draft: Draft, target: Combatant, amount: number): void {
  const applied = Math.min(amount, target.stats.maxHp - target.hp);
  target.hp += applied;
  draft.events.push({ type: 'heal', target: target.id, amount: applied });
}

function resolveTargets(draft: Draft, actor: Combatant, skill: Skill, chosen?: string): Combatant[] {
  const foes = draft.combatants.filter((c) => c.side !== actor.side && c.hp > 0);
  const allies = draft.combatants.filter((c) => c.side === actor.side && c.hp > 0);

  switch (skill.target) {
    case 'self':
      return [actor];
    case 'allFoes':
      return foes;
    case 'allAllies':
      return allies;
    case 'oneFoe': {
      // The chosen target may have fallen between the choice and the swing.
      // Rolling onto someone still standing beats wasting the turn on a
      // corpse — the player picked "hit them", not "hit that exact one".
      const picked = chosen ? foes.find((c) => c.id === chosen) : undefined;
      return picked ? [picked] : foes.slice(0, 1);
    }
    case 'oneAlly':
    default: {
      const picked = chosen ? allies.find((c) => c.id === chosen) : undefined;
      return picked ? [picked] : allies.slice(0, 1);
    }
  }
}

function applySkill(draft: Draft, actor: Combatant, skill: Skill, chosen: string | undefined, rng: Rng): void {
  const targets = resolveTargets(draft, actor, skill, chosen);
  const attackerMult = attackMultiplier(actor.statuses);

  for (const target of targets) {
    if (skill.power > 0 && (skill.kind === 'strike' || skill.kind === 'afflict')) {
      const { amount, band } = computeDamage(
        {
          power: skill.power,
          element: skill.element,
          attackStat: skill.stat === 'atk' ? actor.stats.atk : actor.stats.mag,
          defense: target.stats.def,
          affinity: target.affinity,
          guarding: target.guarding,
          attackerMult,
        },
        rng
      );
      hurt(draft, target, amount, band, skill.element);
    }

    if (skill.kind === 'heal') {
      mend(draft, target, computeHeal(skill.power, actor.stats.mag, rng));
    }

    if (skill.kind === 'cure') {
      const before = target.statuses;
      target.statuses = cureAilments(before);
      draft.events.push({
        type: 'cured',
        target: target.id,
        cleared: before
          .filter((status) => !target.statuses.some((kept) => kept.kind === status.kind))
          .map((status) => status.kind),
      });
    }

    // A status only sticks to someone still standing — otherwise a poison pip
    // would sit on a portrait that has already gone dark.
    if (skill.inflicts && target.hp > 0) {
      if (chance(rng, skill.inflicts.chance)) {
        target.statuses = applyStatus(target.statuses, skill.inflicts.status, skill.inflicts.turns);
        draft.events.push({ type: 'status', target: target.id, status: skill.inflicts.status });
      } else {
        // A miss has to be reported, not merely not-reported. `lull` deals no
        // damage, so on a failed roll the turn produced no event at all and
        // the scene had nothing to draw — a legal, paid-for command that
        // looked exactly like a tap the game had ignored.
        draft.events.push({ type: 'statusFailed', target: target.id, status: skill.inflicts.status });
      }
    }
  }
}

function applyItem(draft: Draft, actor: Combatant, itemId: ItemId, chosen: string | undefined, rng: Rng): void {
  const item = ITEMS[itemId];
  const targets =
    item.target === 'allFoes'
      ? draft.combatants.filter((c) => c.side !== actor.side && c.hp > 0)
      : (() => {
          const allies = draft.combatants.filter((c) => c.side === actor.side && c.hp > 0);
          const picked = chosen ? allies.find((c) => c.id === chosen) : undefined;
          return picked ? [picked] : allies.slice(0, 1);
        })();

  for (const target of targets) {
    if (item.hpFraction) {
      mend(draft, target, Math.max(1, Math.round(target.stats.maxHp * item.hpFraction)));
    }
    if (item.mpRestore) {
      const applied = Math.min(item.mpRestore, target.stats.maxMp - target.mp);
      target.mp += applied;
      draft.events.push({ type: 'mp', target: target.id, amount: applied });
    }
    if (item.cures) {
      const before = target.statuses;
      target.statuses = cureAilments(before);
      draft.events.push({
        type: 'cured',
        target: target.id,
        cleared: before
          .filter((status) => !target.statuses.some((kept) => kept.kind === status.kind))
          .map((status) => status.kind),
      });
    }
    if (item.flatDamage) {
      // A bomb is a bomb: the same hole whoever throws it, so it stays useful
      // in the hands of the Caster with 6 attack and the Vanguard with 30.
      const { amount, band } = computeDamage(
        {
          power: 100,
          element: item.element ?? 'plain',
          attackStat: item.flatDamage,
          defense: target.stats.def,
          affinity: target.affinity,
          guarding: target.guarding,
        },
        rng
      );
      hurt(draft, target, amount, band, item.element ?? 'plain');
    }
  }
}

/** True when the command could not legally be issued — the turn is not spent. */
function isIllegal(state: BattleState, actor: Combatant, command: Command): boolean {
  if (command.kind === 'skill') {
    return SKILLS[command.skill].mpCost > actor.mp;
  }
  if (command.kind === 'item') {
    return (state.bag[command.item] ?? 0) <= 0;
  }
  return false;
}

/**
 * Resolves one command and hands the turn on.
 *
 * Returns the state object it was given, untouched, when the command was not
 * legal — a skill nobody can pay for, an item nobody is carrying. The caller
 * can then re-prompt without having burned the turn, and identity comparison
 * is enough to detect it.
 */
export function takeTurn(
  state: BattleState,
  command: Command,
  rng: Rng
): { state: BattleState; events: BattleEvent[] } {
  const actor = activeCombatant(state);
  if (state.outcome !== 'ongoing' || !actor) {
    return { state, events: [] };
  }

  const asleep = hasStatus(actor.statuses, 'sleep');
  if (!asleep && isIllegal(state, actor, command)) {
    return { state, events: [] };
  }

  const draft: Draft = {
    combatants: state.combatants.map((c) => ({ ...c, statuses: [...c.statuses] })),
    events: [],
    bag: { ...state.bag },
  };
  const acting = get(draft, actor.id);
  const downedBefore = new Set(draft.combatants.filter((c) => c.hp <= 0).map((c) => c.id));

  if (asleep) {
    draft.events.push({ type: 'asleep', actor: acting.id });
  } else {
    switch (command.kind) {
      case 'attack':
        draft.events.push({ type: 'act', actor: acting.id, skill: 'strike' });
        applySkill(draft, acting, SKILLS.strike, command.target, rng);
        break;
      case 'skill':
        draft.events.push({ type: 'act', actor: acting.id, skill: command.skill });
        acting.mp -= SKILLS[command.skill].mpCost;
        applySkill(draft, acting, SKILLS[command.skill], command.target, rng);
        break;
      case 'guard':
        acting.guarding = true;
        draft.events.push({ type: 'guard', actor: acting.id });
        break;
      case 'item':
        draft.events.push({ type: 'act', actor: acting.id, item: command.item });
        draft.bag = { ...draft.bag, [command.item]: (draft.bag[command.item] ?? 0) - 1 };
        applyItem(draft, acting, command.item, command.target, rng);
        break;
    }
  }

  // Poison and regen land at the end of the bearer's own turn — the only
  // timing that reads honestly, since a pip that fired during someone else's
  // turn would look like a bug.
  if (acting.hp > 0) {
    const { statuses, hpDelta, expired } = resolveTurnEnd(acting.statuses, acting.stats.maxHp);
    acting.statuses = statuses;
    if (hpDelta < 0) {
      hurt(draft, acting, -hpDelta, 'neutral', 'plain');
    } else if (hpDelta > 0) {
      mend(draft, acting, hpDelta);
    }
    for (const kind of expired) {
      draft.events.push({ type: 'statusExpired', target: acting.id, status: kind });
    }
  }

  for (const combatant of draft.combatants) {
    if (combatant.hp <= 0 && !downedBefore.has(combatant.id)) {
      draft.events.push({ type: 'down', target: combatant.id });
    }
  }

  return { state: advance(state, draft, rng), events: draft.events };
}

/** Drops the fallen from the order, ends the fight, or opens the next round. */
function advance(previous: BattleState, draft: Draft, rng: Rng): BattleState {
  const alive = (id: string): boolean => draft.combatants.find((c) => c.id === id)!.hp > 0;

  const partyStanding = draft.combatants.some((c) => c.side === 'party' && c.hp > 0);
  const foesStanding = draft.combatants.some((c) => c.side === 'foes' && c.hp > 0);
  if (!partyStanding || !foesStanding) {
    const outcome: Outcome = partyStanding ? 'won' : 'lost';
    draft.events.push({ type: 'outcome', outcome });
    return { combatants: draft.combatants, order: [], round: previous.round, outcome, bag: draft.bag };
  }

  let order = previous.order.slice(1).filter(alive);
  let round = previous.round;
  if (order.length === 0) {
    round += 1;
    order = buildTurnOrder(
      draft.combatants.map((c) => ({ id: c.id, spd: c.stats.spd, alive: c.hp > 0 })),
      rng
    );
  }

  // A guard covers its owner right up to the moment they act again, so it is
  // dropped as their turn opens rather than when it was raised. Doing it here
  // means the flag is already false by the time the scene draws the menu.
  const next = order[0];
  return {
    combatants: draft.combatants.map((c) => (c.id === next ? { ...c, guarding: false } : c)),
    order,
    round,
    outcome: 'ongoing',
    bag: draft.bag,
  };
}

// --- the other side -------------------------------------------------------

/**
 * What the monster does with its turn.
 *
 * Deliberately shallow. The interesting decisions in this game belong to the
 * player reading colours, and a monster that outplayed them would only make
 * that reading feel pointless. It has exactly three habits: it heals itself
 * when badly hurt, it does not re-apply a status that is already stuck on
 * everyone, and it leans towards whoever is closest to falling.
 */
export function enemyCommand(state: BattleState, rng: Rng): Command {
  const actor = activeCombatant(state)!;
  const heroes = livingHeroes(state);

  const aim = (): string => {
    const weakest = heroes.reduce((low, hero) => (hero.hp < low.hp ? hero : low), heroes[0]);
    // Not always the weakest: a monster that reliably finishes the wounded
    // makes losing one hero into losing the run, with nothing the player can
    // do about it once the spiral starts.
    return chance(rng, 0.4) ? weakest.id : pick(rng, heroes).id;
  };

  if (heroes.length === 0) {
    return { kind: 'guard' };
  }

  const moves = ENEMIES[actor.enemyId!].moves.filter((id) => SKILLS[id].mpCost <= actor.mp);

  const heal = moves.find((id) => SKILLS[id].kind === 'heal');
  if (heal && actor.hp < actor.stats.maxHp * 0.4 && chance(rng, 0.6)) {
    return { kind: 'skill', skill: heal, target: actor.id };
  }

  const useful = moves.filter((id) => {
    const skill = SKILLS[id];
    if (skill.kind === 'heal') {
      return false;
    }
    // Skip an affliction the whole party already carries: it would look like
    // the monster wasted its turn, which — for once — it would have.
    if (skill.inflicts && heroes.every((hero) => hasStatus(hero.statuses, skill.inflicts!.status))) {
      return false;
    }
    return true;
  });

  if (useful.length === 0) {
    return { kind: 'attack', target: aim() };
  }

  const choice = pick(rng, useful);
  return isSpread(SKILLS[choice]) || SKILLS[choice].target === 'self'
    ? { kind: 'skill', skill: choice, target: actor.id }
    : { kind: 'skill', skill: choice, target: aim() };
}

// --- back out again -------------------------------------------------------

/** Copies HP, MP and statuses off the field and onto the party that fought. */
export function applyBattleToParty(party: readonly Hero[], state: BattleState): Hero[] {
  return party.map((hero) => {
    const combatant = findCombatant(state, `hero:${hero.id}`);
    if (!combatant) {
      return hero;
    }
    return { ...hero, hp: combatant.hp, mp: combatant.mp, statuses: [...combatant.statuses] };
  });
}

/** Total EXP the party takes from clearing this crowd. */
export function expReward(foes: readonly EnemyId[]): number {
  return foes.reduce((total, id) => total + ENEMIES[id].exp, 0);
}
