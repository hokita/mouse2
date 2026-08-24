import { describe, expect, it } from 'vitest';
import {
  activeCombatant,
  applyBattleToParty,
  canAct,
  createBattle,
  enemyCommand,
  findCombatant,
  livingFoes,
  livingHeroes,
  takeTurn,
} from '../battle';
import type { BattleState, Command } from '../battle';
import { createParty, heroStats } from '../party';
import type { Hero } from '../party';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import { SKILLS } from '../skills';
import { ENEMIES } from '../enemies';
import type { EnemyId } from '../enemies';

/** Mid-range on every draw: no variance, and any chance above 0.5 lands. */
const flat: Rng = () => 0.5;
/** Nothing chancy ever lands. */
const unlucky: Rng = () => 0.999;
/** Everything chancy lands. */
const lucky: Rng = () => 0;

function battle(foes: readonly EnemyId[] = ['blob'], seed = 1): BattleState {
  return createBattle(createParty(), [...foes], createRng(seed));
}

/** Winds the round on until `id` is the one to act. */
function until(state: BattleState, id: string, rng: Rng = flat): BattleState {
  let current = state;
  for (let i = 0; i < 40 && activeCombatant(current)?.id !== id; i += 1) {
    const actor = activeCombatant(current);
    if (!actor || current.outcome !== 'ongoing') {
      break;
    }
    current = takeTurn(current, { kind: 'guard' }, rng).state;
  }
  return current;
}

describe('createBattle', () => {
  it('puts both sides on the field', () => {
    const state = battle(['blob', 'imp']);
    expect(livingHeroes(state)).toHaveLength(3);
    expect(livingFoes(state)).toHaveLength(2);
    expect(state.outcome).toBe('ongoing');
    expect(state.round).toBe(1);
  });

  it('gives every combatant a distinct id, including two of the same species', () => {
    const state = battle(['blob', 'blob']);
    const ids = state.combatants.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the party in as it stands, wounds and all', () => {
    const party = createParty();
    party[0] = { ...party[0], hp: 7, mp: 2 };
    const state = createBattle(party, ['blob'], createRng(1));
    const vanguard = findCombatant(state, 'hero:vanguard');
    expect(vanguard?.hp).toBe(7);
    expect(vanguard?.mp).toBe(2);
  });

  it('gives monsters the affinity the bestiary says they have', () => {
    const state = battle(['imp']);
    expect(findCombatant(state, 'foe:0')?.affinity).toEqual(ENEMIES.imp.affinity);
  });

  it('lines everyone up fastest first', () => {
    const state = battle(['blob']);
    const speeds = state.order.map((id) => findCombatant(state, id)!.stats.spd);
    expect([...speeds].sort((a, b) => b - a)).toEqual(speeds);
  });
});

describe('taking a turn', () => {
  it('wounds the target with a plain attack', () => {
    const state = until(battle(), 'hero:vanguard');
    const before = findCombatant(state, 'foe:0')!.hp;
    const { state: after, events } = takeTurn(state, { kind: 'attack', target: 'foe:0' }, flat);
    expect(findCombatant(after, 'foe:0')!.hp).toBeLessThan(before);
    expect(events.some((e) => e.type === 'damage')).toBe(true);
  });

  it('reports a weakness so the scene can shout about it', () => {
    // A blob burns. The Caster's fire bolt should come back marked.
    const state = until(battle(['blob']), 'hero:caster');
    const withFlare: Hero[] = createParty().map((h) =>
      h.id === 'caster' ? { ...h, level: 4 } : h
    );
    const ready = until(createBattle(withFlare, ['blob'], createRng(1)), 'hero:caster');
    const { events } = takeTurn(ready, { kind: 'skill', skill: 'flare', target: 'foe:0' }, flat);
    const damage = events.find((e) => e.type === 'damage');
    expect(damage).toMatchObject({ band: 'weak' });
    expect(state.outcome).toBe('ongoing');
  });

  it('reports a resisted hit too', () => {
    // An imp shrugs off fire.
    const withFlare: Hero[] = createParty().map((h) =>
      h.id === 'caster' ? { ...h, level: 4 } : h
    );
    const ready = until(createBattle(withFlare, ['imp'], createRng(1)), 'hero:caster');
    const { events } = takeTurn(ready, { kind: 'skill', skill: 'flare', target: 'foe:0' }, flat);
    expect(events.find((e) => e.type === 'damage')).toMatchObject({ band: 'resist' });
  });

  it('charges MP for a skill', () => {
    const state = until(battle(), 'hero:caster');
    const before = findCombatant(state, 'hero:caster')!.mp;
    const { state: after } = takeTurn(state, { kind: 'skill', skill: 'frost', target: 'foe:0' }, flat);
    expect(findCombatant(after, 'hero:caster')!.mp).toBe(before - SKILLS.frost.mpCost);
  });

  it('refuses a skill the caster cannot pay for, and does not burn the turn', () => {
    let state = until(battle(), 'hero:caster');
    state = {
      ...state,
      combatants: state.combatants.map((c) => (c.id === 'hero:caster' ? { ...c, mp: 0 } : c)),
    };
    const { state: after, events } = takeTurn(state, { kind: 'skill', skill: 'frost', target: 'foe:0' }, flat);
    expect(events).toEqual([]);
    expect(after).toBe(state);
  });

  it('lands a spread skill on every living foe', () => {
    const party: Hero[] = createParty().map((h) => (h.id === 'caster' ? { ...h, level: 8 } : h));
    const ready = until(createBattle(party, ['golem', 'golem', 'golem'], createRng(1)), 'hero:caster');
    const before = livingFoes(ready).map((c) => c.hp);
    const { state: after, events } = takeTurn(ready, { kind: 'skill', skill: 'storm' }, flat);
    const struck = events.filter((e) => e.type === 'damage').map((e) => (e as { target: string }).target);
    expect(new Set(struck).size).toBe(3);
    livingFoes(after).forEach((foe, i) => expect(foe.hp).toBeLessThan(before[i]));
  });

  it('mends an ally and never past full', () => {
    const party: Hero[] = createParty().map((h) => (h.id === 'vanguard' ? { ...h, hp: 4 } : h));
    const ready = until(createBattle(party, ['blob'], createRng(1)), 'hero:warden');
    const { state: after, events } = takeTurn(
      ready,
      { kind: 'skill', skill: 'mend', target: 'hero:vanguard' },
      flat
    );
    const healed = findCombatant(after, 'hero:vanguard')!;
    expect(healed.hp).toBeGreaterThan(4);
    expect(healed.hp).toBeLessThanOrEqual(healed.stats.maxHp);
    expect(events.some((e) => e.type === 'heal')).toBe(true);
  });

  it('never heals past the bar even with a huge roll', () => {
    const party: Hero[] = createParty().map((h) =>
      h.id === 'vanguard' ? { ...h, hp: heroStats(h).maxHp - 1 } : h
    );
    const ready = until(createBattle(party, ['blob'], createRng(1)), 'hero:warden');
    const { state: after } = takeTurn(ready, { kind: 'skill', skill: 'mend', target: 'hero:vanguard' }, flat);
    const healed = findCombatant(after, 'hero:vanguard')!;
    expect(healed.hp).toBe(healed.stats.maxHp);
  });

  it('halves what lands on a guarding target', () => {
    const state = until(battle(), 'hero:vanguard');
    const guarded = takeTurn(state, { kind: 'guard' }, flat).state;
    expect(findCombatant(guarded, 'hero:vanguard')!.guarding).toBe(true);
  });

  it('drops the guard when that hero comes round again', () => {
    let state = until(battle(), 'hero:vanguard');
    state = takeTurn(state, { kind: 'guard' }, flat).state;
    state = until(state, 'hero:vanguard');
    expect(findCombatant(state, 'hero:vanguard')!.guarding).toBe(false);
  });

  it('inflicts a status when the roll lands, and not when it does not', () => {
    const party: Hero[] = createParty().map((h) => (h.id === 'warden' ? { ...h, level: 2 } : h));
    const ready = until(createBattle(party, ['blob'], createRng(1)), 'hero:warden');

    const hit = takeTurn(ready, { kind: 'skill', skill: 'venom', target: 'foe:0' }, lucky);
    expect(findCombatant(hit.state, 'foe:0')!.statuses.some((s) => s.kind === 'poison')).toBe(true);
    expect(hit.events.some((e) => e.type === 'status')).toBe(true);

    const missed = takeTurn(ready, { kind: 'skill', skill: 'venom', target: 'foe:0' }, unlucky);
    expect(findCombatant(missed.state, 'foe:0')!.statuses).toEqual([]);
  });

  it('says what a cure actually lifted, including nothing', () => {
    // A cleanse that finds no ailment still costs MP and still ends the turn,
    // so the scene has to be able to tell the two apart and draw both.
    const party: Hero[] = createParty().map((h) => (h.id === 'warden' ? { ...h, level: 4 } : h));
    const clean = until(createBattle(party, ['blob'], createRng(1)), 'hero:warden');

    const nothing = takeTurn(clean, { kind: 'skill', skill: 'cleanse', target: 'hero:vanguard' }, flat);
    expect(nothing.events.find((e) => e.type === 'cured')).toMatchObject({ cleared: [] });

    const afflicted: BattleState = {
      ...clean,
      combatants: clean.combatants.map((c) =>
        c.id === 'hero:vanguard'
          ? { ...c, statuses: [{ kind: 'poison', turns: 3 }, { kind: 'regen', turns: 3 }] }
          : c
      ),
    };
    const lifted = takeTurn(afflicted, { kind: 'skill', skill: 'cleanse', target: 'hero:vanguard' }, flat);
    // The blessing is not an ailment, so it is kept and not reported as lifted.
    expect(lifted.events.find((e) => e.type === 'cured')).toMatchObject({ cleared: ['poison'] });
  });

  it('reports an affliction that did not take, so a paid turn is never silent', () => {
    // `lull` deals no damage, so on a failed roll the turn used to produce no
    // event whatsoever - a legal, MP-spending command that the scene had
    // nothing to draw for and which looked like an ignored tap.
    const party: Hero[] = createParty().map((h) => (h.id === 'caster' ? { ...h, level: 5 } : h));
    const ready = until(createBattle(party, ['blob'], createRng(1)), 'hero:caster');

    const missed = takeTurn(ready, { kind: 'skill', skill: 'lull', target: 'foe:0' }, unlucky);
    expect(missed.events.some((e) => e.type === 'statusFailed')).toBe(true);
    expect(missed.events.some((e) => e.type === 'status')).toBe(false);
    expect(findCombatant(missed.state, 'foe:0')!.statuses).toEqual([]);

    const landed = takeTurn(ready, { kind: 'skill', skill: 'lull', target: 'foe:0' }, lucky);
    expect(landed.events.some((e) => e.type === 'status')).toBe(true);
    expect(landed.events.some((e) => e.type === 'statusFailed')).toBe(false);
  });

  it('never reports a failed affliction against something already down', () => {
    // The inflict roll is skipped entirely for a fallen target, so there is
    // no miss to announce either.
    let state = until(battle(), 'hero:warden');
    state = {
      ...state,
      combatants: state.combatants.map((c) => (c.id === 'foe:0' ? { ...c, hp: 0 } : c)),
    };
    const { events } = takeTurn(state, { kind: 'attack', target: 'foe:0' }, unlucky);
    expect(events.some((e) => e.type === 'statusFailed')).toBe(false);
  });

  it('skips the turn of a sleeper and says why', () => {
    let state = until(battle(), 'hero:vanguard');
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'hero:vanguard' ? { ...c, statuses: [{ kind: 'sleep', turns: 2 }] } : c
      ),
    };
    const before = findCombatant(state, 'foe:0')!.hp;
    const { state: after, events } = takeTurn(state, { kind: 'attack', target: 'foe:0' }, flat);
    expect(events.some((e) => e.type === 'asleep')).toBe(true);
    expect(findCombatant(after, 'foe:0')!.hp).toBe(before);
    expect(activeCombatant(after)?.id).not.toBe('hero:vanguard');
  });

  it('says a sleeper cannot act, so the menu is never shown to them', () => {
    let state = until(battle(), 'hero:vanguard');
    expect(canAct(state)).toBe(true);
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'hero:vanguard' ? { ...c, statuses: [{ kind: 'sleep', turns: 2 }] } : c
      ),
    };
    expect(canAct(state)).toBe(false);
  });

  it('shakes a sleeper awake with damage', () => {
    let state = until(battle(), 'hero:vanguard');
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'foe:0' ? { ...c, statuses: [{ kind: 'sleep', turns: 3 }] } : c
      ),
    };
    const { state: after } = takeTurn(state, { kind: 'attack', target: 'foe:0' }, flat);
    expect(findCombatant(after, 'foe:0')!.statuses.some((s) => s.kind === 'sleep')).toBe(false);
  });

  it('bleeds the poisoned at the end of their own turn', () => {
    let state = until(battle(), 'hero:vanguard');
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'hero:vanguard' ? { ...c, statuses: [{ kind: 'poison', turns: 3 }] } : c
      ),
    };
    const before = findCombatant(state, 'hero:vanguard')!.hp;
    const { state: after } = takeTurn(state, { kind: 'guard' }, flat);
    expect(findCombatant(after, 'hero:vanguard')!.hp).toBeLessThan(before);
  });

  it('clears ailments with a cure but leaves the blessing', () => {
    const party: Hero[] = createParty().map((h) => (h.id === 'warden' ? { ...h, level: 4 } : h));
    let state = until(createBattle(party, ['blob'], createRng(1)), 'hero:warden');
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'hero:vanguard'
          ? { ...c, statuses: [{ kind: 'poison', turns: 3 }, { kind: 'regen', turns: 3 }] }
          : c
      ),
    };
    const { state: after } = takeTurn(state, { kind: 'skill', skill: 'cleanse', target: 'hero:vanguard' }, flat);
    const cured = findCombatant(after, 'hero:vanguard')!;
    expect(cured.statuses.map((s) => s.kind)).toEqual(['regen']);
  });
});

describe('items', () => {
  it('drinks a potion, spends it, and mends by share of maximum', () => {
    const party: Hero[] = createParty().map((h) => (h.id === 'vanguard' ? { ...h, hp: 3 } : h));
    const ready = until(createBattle(party, ['blob'], createRng(1)), 'hero:vanguard');
    const { state: after, events } = takeTurn(
      ready,
      { kind: 'item', item: 'potion', target: 'hero:vanguard' },
      flat
    );
    expect(findCombatant(after, 'hero:vanguard')!.hp).toBeGreaterThan(3);
    expect(after.bag.potion).toBe(ready.bag.potion - 1);
    expect(events.some((e) => e.type === 'heal')).toBe(true);
  });

  it('refuses an item the bag does not hold, and does not burn the turn', () => {
    const ready = until(battle(), 'hero:vanguard');
    const { state: after, events } = takeTurn(ready, { kind: 'item', item: 'bomb' }, flat);
    expect(after).toBe(ready);
    expect(events).toEqual([]);
  });

  it('throws a bomb at everyone on the other side', () => {
    let ready = until(battle(['blob', 'blob']), 'hero:vanguard');
    ready = { ...ready, bag: { ...ready.bag, bomb: 1 } };
    const before = livingFoes(ready).map((c) => c.hp);
    const { state: after } = takeTurn(ready, { kind: 'item', item: 'bomb' }, flat);
    livingFoes(after).forEach((foe, i) => expect(foe.hp).toBeLessThan(before[i]));
  });
});

describe('ending a fight', () => {
  it('takes a felled foe out of the order and marks it down', () => {
    let state = until(battle(['blob', 'blob']), 'hero:vanguard');
    state = {
      ...state,
      combatants: state.combatants.map((c) => (c.id === 'foe:0' ? { ...c, hp: 1 } : c)),
    };
    const { state: after, events } = takeTurn(state, { kind: 'attack', target: 'foe:0' }, flat);
    expect(findCombatant(after, 'foe:0')!.hp).toBe(0);
    expect(after.order).not.toContain('foe:0');
    expect(events.some((e) => e.type === 'down')).toBe(true);
  });

  it('is won when the last foe falls', () => {
    let state = until(battle(), 'hero:vanguard');
    state = {
      ...state,
      combatants: state.combatants.map((c) => (c.id === 'foe:0' ? { ...c, hp: 1 } : c)),
    };
    const { state: after, events } = takeTurn(state, { kind: 'attack', target: 'foe:0' }, flat);
    expect(after.outcome).toBe('won');
    expect(events.some((e) => e.type === 'outcome')).toBe(true);
  });

  it('is lost when the last hero falls', () => {
    let state = battle(['golem']);
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.side === 'party' ? { ...c, hp: c.id === 'hero:warden' ? 1 : 0 } : c
      ),
      order: ['hero:warden'],
    };
    // Poison finishes the last one standing at the end of their own turn.
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'hero:warden' ? { ...c, statuses: [{ kind: 'poison', turns: 2 }] } : c
      ),
    };
    const { state: after } = takeTurn(state, { kind: 'guard' }, flat);
    expect(after.outcome).toBe('lost');
  });

  it('ignores commands once it is over', () => {
    let state = until(battle(), 'hero:vanguard');
    state = {
      ...state,
      combatants: state.combatants.map((c) => (c.id === 'foe:0' ? { ...c, hp: 1 } : c)),
    };
    const won = takeTurn(state, { kind: 'attack', target: 'foe:0' }, flat).state;
    const again = takeTurn(won, { kind: 'attack', target: 'foe:0' }, flat);
    expect(again.state).toBe(won);
    expect(again.events).toEqual([]);
  });

  it('starts a fresh round once everyone has acted', () => {
    let state = battle();
    const first = state.round;
    const turnsInRound = state.order.length;
    for (let i = 0; i < turnsInRound; i += 1) {
      state = takeTurn(state, { kind: 'guard' }, flat).state;
    }
    expect(state.round).toBe(first + 1);
    expect(state.order.length).toBeGreaterThan(0);
  });
});

describe('enemyCommand', () => {
  it('always produces something the monster can pay for', () => {
    const rng = createRng(5);
    for (const foe of ['blob', 'shade', 'crown'] as const) {
      let state = until(battle([foe]), 'foe:0', rng);
      for (let i = 0; i < 20; i += 1) {
        const actor = activeCombatant(state);
        if (!actor || actor.side !== 'foes' || state.outcome !== 'ongoing') {
          state = until(state, 'foe:0', rng);
          continue;
        }
        const command = enemyCommand(state, rng);
        if (command.kind === 'skill') {
          expect(SKILLS[command.skill].mpCost).toBeLessThanOrEqual(actor.mp);
        }
        state = takeTurn(state, command, rng).state;
        if (state.outcome !== 'ongoing') {
          break;
        }
      }
    }
  });

  it('only ever aims at someone still standing', () => {
    const rng = createRng(6);
    let state = until(battle(['blob']), 'foe:0', rng);
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.side === 'party' && c.id !== 'hero:warden' ? { ...c, hp: 0 } : c
      ),
    };
    for (let i = 0; i < 30; i += 1) {
      const command = enemyCommand(state, rng);
      const target = 'target' in command ? command.target : undefined;
      if (target) {
        expect(target).toBe('hero:warden');
      }
    }
  });
});

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const run = (seed: number): string => {
      const rng = createRng(seed);
      let state = createBattle(createParty(), ['imp', 'wisp'], rng);
      for (let i = 0; i < 60 && state.outcome === 'ongoing'; i += 1) {
        const actor = activeCombatant(state);
        if (!actor) {
          break;
        }
        const command: Command =
          actor.side === 'foes'
            ? enemyCommand(state, rng)
            : { kind: 'attack', target: livingFoes(state)[0]?.id ?? '' };
        state = takeTurn(state, command, rng).state;
      }
      return `${state.outcome}:${state.combatants.map((c) => c.hp).join(',')}`;
    };
    expect(run(31)).toBe(run(31));
    expect(run(31)).not.toBe(run(32));
  });
});

describe('applyBattleToParty', () => {
  it('writes the damage back onto the heroes that took it', () => {
    let state = until(battle(), 'hero:vanguard');
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === 'hero:caster' ? { ...c, hp: 3, mp: 1, statuses: [{ kind: 'poison', turns: 2 }] } : c
      ),
    };
    const party = applyBattleToParty(createParty(), state);
    const caster = party.find((h) => h.id === 'caster')!;
    expect(caster.hp).toBe(3);
    expect(caster.mp).toBe(1);
    expect(caster.statuses).toEqual([{ kind: 'poison', turns: 2 }]);
  });

  it('keeps level and EXP, which battles never touch', () => {
    const party = createParty().map((h) => ({ ...h, level: 4, exp: 200 }));
    const state = createBattle(party, ['blob'], createRng(1));
    const after = applyBattleToParty(party, state);
    expect(after[0].level).toBe(4);
    expect(after[0].exp).toBe(200);
  });
});
