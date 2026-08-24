import { describe, expect, it } from 'vitest';
import {
  BOONS,
  BOON_IDS,
  createRun,
  currentNode,
  encounterAt,
  finishBattle,
  isVictory,
  openTreasure,
  optionsFor,
  runProgress,
  shrineOffer,
  takeBoon,
  takeRest,
  travelTo,
} from '../run';
import type { RunState } from '../run';
import { MAP_ROWS, nodeAt } from '../nodeMap';
import { ENEMIES } from '../enemies';
import { createBattle, applyBattleToParty } from '../battle';
import { createRng } from '../rng';
import { HEROES, heroStats } from '../party';

const run = (seed = 1) => createRun(seed);

/** Walks the run to the first node of the given kind, or throws. */
function walkTo(state: RunState, kind: string): RunState {
  let current = state;
  for (let row = 0; row < MAP_ROWS; row += 1) {
    const options = optionsFor(current);
    const match = options.find((node) => node.kind === kind);
    if (match) {
      return travelTo(current, match.id);
    }
    if (options.length === 0) {
      break;
    }
    current = travelTo(current, options[0].id);
  }
  throw new Error(`no ${kind} on this route`);
}

describe('createRun', () => {
  it('starts a whole party at the bottom of a fresh map', () => {
    const state = run();
    expect(state.party).toHaveLength(3);
    expect(state.at).toBe(state.map.startId);
    expect(currentNode(state).kind).toBe('start');
    expect(isVictory(state)).toBe(false);
    for (const hero of state.party) {
      expect(hero.hp).toBe(heroStats(hero).maxHp);
      expect(hero.level).toBe(1);
    }
  });

  it('gives the same run for the same seed', () => {
    const shape = (s: RunState) => s.map.nodes.map((n) => `${n.row}${n.kind}`).join('');
    expect(shape(run(9))).toBe(shape(run(9)));
    expect(shape(run(9))).not.toBe(shape(run(10)));
  });
});

describe('travelTo', () => {
  it('moves onto a node the current one leads to', () => {
    const state = run();
    const target = optionsFor(state)[0];
    const moved = travelTo(state, target.id);
    expect(moved.at).toBe(target.id);
    expect(moved.visited).toContain(target.id);
  });

  it('refuses a node that is not on offer, rather than teleporting', () => {
    const state = run();
    const far = state.map.nodes.find((n) => n.row === 5)!;
    expect(travelTo(state, far.id)).toBe(state);
  });

  it('leaves the run it was given alone', () => {
    const state = run();
    travelTo(state, optionsFor(state)[0].id);
    expect(state.at).toBe(state.map.startId);
  });
});

describe('isVictory', () => {
  it('is only true standing on the boss with the boss beaten', () => {
    const state = run();
    expect(isVictory({ ...state, at: state.map.bossId })).toBe(false);
    expect(isVictory({ ...state, at: state.map.bossId, visited: [state.map.bossId], bossDown: true })).toBe(true);
  });
});

describe('runProgress', () => {
  it('runs from nothing at the start to everything at the boss', () => {
    const state = run();
    expect(runProgress(state)).toBe(0);
    expect(runProgress({ ...state, at: state.map.bossId })).toBe(1);
  });

  it('climbs as the party does', () => {
    let state = run();
    let last = runProgress(state);
    for (let i = 0; i < 4; i += 1) {
      state = travelTo(state, optionsFor(state)[0].id);
      expect(runProgress(state)).toBeGreaterThan(last);
      last = runProgress(state);
    }
  });
});

describe('encounterAt', () => {
  it('draws monsters from the tier of the node being fought', () => {
    const state = run();
    for (const node of state.map.nodes) {
      if (node.kind !== 'battle' && node.kind !== 'elite') {
        continue;
      }
      for (const foe of encounterAt(node, createRng(node.id))) {
        expect(ENEMIES[foe].tier).toBe(node.tier);
      }
    }
  });

  it('sends the boss alone at the top of the map', () => {
    const state = run();
    expect(encounterAt(nodeAt(state.map, state.map.bossId)!, createRng(1))).toEqual(['crown']);
  });
});

describe('finishBattle', () => {
  it('pays the whole party, whoever was standing at the end', () => {
    const state = run();
    const battle = createBattle(state.party, ['blob'], createRng(1));
    const { run: after, exp } = finishBattle(state, battle, ['blob']);
    expect(exp).toBe(ENEMIES.blob.exp);
    for (const hero of after.party) {
      expect(hero.exp).toBe(ENEMIES.blob.exp);
    }
  });

  it('carries the wounds out of the fight rather than tidying them away', () => {
    const state = run();
    let battle = createBattle(state.party, ['blob'], createRng(1));
    battle = {
      ...battle,
      combatants: battle.combatants.map((c) => (c.id === 'hero:mom' ? { ...c, hp: 4 } : c)),
    };
    const { run: after } = finishBattle(state, battle, ['blob']);
    const mom = after.party.find((h) => h.id === 'mom')!;
    expect(mom.hp).toBeLessThan(heroStats(mom).maxHp);
    expect(mom.hp).toBeLessThan(state.party.find((h) => h.id === 'mom')!.hp);
  });

  it('adds nothing to a wound but the level-up grant it earned', () => {
    // A single blob pays 22 EXP, which is enough for level 2 - so the hero
    // leaves this fight both hurt and one level up. The two effects have to
    // compose exactly, with no quiet top-up hiding between them.
    const state = run();
    let battle = createBattle(state.party, ['blob'], createRng(1));
    battle = {
      ...battle,
      combatants: battle.combatants.map((c) => (c.id === 'hero:mom' ? { ...c, hp: 4 } : c)),
    };
    const { run: after } = finishBattle(state, battle, ['blob']);
    const mom = after.party.find((h) => h.id === 'mom')!;
    expect(mom.level).toBe(2);
    expect(mom.hp).toBe(4 + HEROES.mom.growth.maxHp);
  });

  it('picks the fallen back up, but only just', () => {
    const state = run();
    let battle = createBattle(state.party, ['blob'], createRng(1));
    battle = {
      ...battle,
      combatants: battle.combatants.map((c) =>
        c.id === 'hero:dad' ? { ...c, hp: 0, statuses: [{ kind: 'poison', turns: 3 }] } : c
      ),
    };
    const { run: after } = finishBattle(state, battle, ['blob']);
    const dad = after.party.find((h) => h.id === 'dad')!;
    expect(dad.hp).toBeGreaterThan(0);
    expect(dad.hp).toBeLessThan(heroStats(dad).maxHp);
    expect(dad.statuses).toEqual([]);
  });

  it('reports the level ups so the scene can celebrate them', () => {
    const state = run();
    const battle = createBattle(state.party, ['crown'], createRng(1));
    const { levelUps } = finishBattle(state, battle, ['crown']);
    expect(levelUps.length).toBe(3);
    expect(levelUps[0].level).toBeGreaterThan(1);
    expect(levelUps[0].learned.length).toBeGreaterThan(0);
  });

  it('keeps whatever is left in the bag', () => {
    const state = run();
    const battle = createBattle(state.party, ['blob'], createRng(1), { potion: 0 });
    const { run: after } = finishBattle(state, battle, ['blob']);
    expect(after.bag.potion).toBe(0);
  });

  it('remembers that the boss went down', () => {
    const state = run();
    const battle = createBattle(state.party, ['crown'], createRng(1));
    expect(finishBattle(state, battle, ['crown']).run.bossDown).toBe(true);
    expect(finishBattle(state, battle, ['blob']).run.bossDown).toBe(false);
  });
});

describe('takeRest', () => {
  it('gives everything back', () => {
    let state = run();
    state = {
      ...state,
      party: state.party.map((h) => ({ ...h, hp: 1, mp: 0, statuses: [{ kind: 'poison', turns: 4 }] })),
    };
    for (const hero of takeRest(state).party) {
      expect(hero.hp).toBe(heroStats(hero).maxHp);
      expect(hero.mp).toBe(heroStats(hero).maxMp);
      expect(hero.statuses).toEqual([]);
    }
  });
});

describe('openTreasure', () => {
  it('puts something in the bag and says what', () => {
    const state = run();
    const { run: after, gained } = openTreasure(state, createRng(3));
    expect(gained.length).toBeGreaterThan(0);
    for (const item of gained) {
      expect(after.bag[item] ?? 0).toBeGreaterThan(state.bag[item] ?? 0);
    }
  });

  it('reaches beyond potions across a spread of chests', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      for (const item of openTreasure(run(), createRng(seed)).gained) {
        kinds.add(item);
      }
    }
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('shrines', () => {
  it('offers three distinct blessings to choose between', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const offer = shrineOffer(createRng(seed));
      expect(offer).toHaveLength(3);
      expect(new Set(offer).size).toBe(3);
      for (const id of offer) {
        expect(BOON_IDS).toContain(id);
      }
    }
  });

  it('gives every hero the blessing, not just the one in front', () => {
    const state = run();
    const before = state.party.map((h) => heroStats(h).maxHp);
    const after = takeBoon(state, 'vigor');
    after.party.forEach((hero, i) => {
      expect(heroStats(hero).maxHp).toBe(before[i] + BOONS.vigor.bonus.maxHp!);
    });
  });

  it('grants the new maximum as real HP, so a blessing is felt at once', () => {
    const state = run();
    const wounded = { ...state, party: state.party.map((h) => ({ ...h, hp: 5 })) };
    for (const hero of takeBoon(wounded, 'vigor').party) {
      expect(hero.hp).toBe(5 + BOONS.vigor.bonus.maxHp!);
    }
  });

  it('stacks when the same blessing is taken twice', () => {
    const state = run();
    const twice = takeBoon(takeBoon(state, 'edge'), 'edge');
    expect(heroStats(twice.party[0]).atk).toBe(
      heroStats(state.party[0]).atk + BOONS.edge.bonus.atk! * 2
    );
  });

  it('never lifts a stat nobody has', () => {
    for (const id of BOON_IDS) {
      const entries = Object.entries(BOONS[id].bonus);
      expect(entries.length).toBeGreaterThan(0);
      for (const [, value] of entries) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('gives every blessing a glyph, because the name is never shown', () => {
    for (const id of BOON_IDS) {
      expect(BOONS[id].glyph).toBeTruthy();
    }
  });
});

describe('walking a whole map', () => {
  it('can always reach a rest, a treasure and a shrine on some route', () => {
    // Not on every route — but a run where one of these never appears at all
    // would be a run missing a third of its vocabulary.
    for (const kind of ['rest', 'treasure', 'shrine']) {
      let found = false;
      for (let seed = 0; seed < 10 && !found; seed += 1) {
        try {
          walkTo(run(seed), kind);
          found = true;
        } catch {
          /* try the next seed */
        }
      }
      expect(found).toBe(true);
    }
  });

  it('ends on the boss however the player turns', () => {
    let state = run(4);
    for (let row = 0; row < MAP_ROWS - 1; row += 1) {
      const options = optionsFor(state);
      expect(options.length).toBeGreaterThan(0);
      state = travelTo(state, options[options.length - 1].id);
    }
    expect(state.at).toBe(state.map.bossId);
    expect(optionsFor(state)).toEqual([]);
  });
});

describe('applyBattleToParty round trip', () => {
  it('is what finishBattle is built on', () => {
    const state = run();
    const battle = createBattle(state.party, ['blob'], createRng(1));
    expect(applyBattleToParty(state.party, battle).map((h) => h.hp)).toEqual(
      state.party.map((h) => h.hp)
    );
  });
});
