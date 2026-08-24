import { describe, expect, it } from 'vitest';
import {
  ATK_DOWN_MULT,
  POISON_FRACTION,
  REGEN_FRACTION,
  applyStatus,
  attackMultiplier,
  cureAilments,
  hasStatus,
  resolveTurnEnd,
  wakeOnDamage,
} from '../status';

describe('applyStatus', () => {
  it('adds a status the target does not have', () => {
    const out = applyStatus([], 'poison', 3);
    expect(out).toEqual([{ kind: 'poison', turns: 3 }]);
  });

  it('does not stack a status the target already has', () => {
    const out = applyStatus([{ kind: 'poison', turns: 1 }], 'poison', 3);
    expect(out).toHaveLength(1);
  });

  it('refreshes to the longer of the two durations', () => {
    expect(applyStatus([{ kind: 'poison', turns: 4 }], 'poison', 2)[0].turns).toBe(4);
    expect(applyStatus([{ kind: 'poison', turns: 1 }], 'poison', 2)[0].turns).toBe(2);
  });

  it('leaves the caller list alone', () => {
    const before = [{ kind: 'poison' as const, turns: 1 }];
    applyStatus(before, 'sleep', 2);
    expect(before).toHaveLength(1);
  });
});

describe('attackMultiplier', () => {
  it('is unchanged with no debuff', () => {
    expect(attackMultiplier([])).toBe(1);
  });

  it('drops while attack-down is on', () => {
    expect(attackMultiplier([{ kind: 'atkDown', turns: 2 }])).toBe(ATK_DOWN_MULT);
  });
});

describe('wakeOnDamage', () => {
  it('shakes off sleep', () => {
    const out = wakeOnDamage([{ kind: 'sleep', turns: 3 }, { kind: 'poison', turns: 2 }]);
    expect(hasStatus(out, 'sleep')).toBe(false);
    expect(hasStatus(out, 'poison')).toBe(true);
  });

  it('is a no-op on a target that was awake', () => {
    const before = [{ kind: 'poison' as const, turns: 2 }];
    expect(wakeOnDamage(before)).toEqual(before);
  });
});

describe('cureAilments', () => {
  it('clears the bad ones and keeps the good one', () => {
    const out = cureAilments([
      { kind: 'poison', turns: 3 },
      { kind: 'sleep', turns: 2 },
      { kind: 'atkDown', turns: 4 },
      { kind: 'regen', turns: 3 },
    ]);
    expect(out).toEqual([{ kind: 'regen', turns: 3 }]);
  });
});

describe('resolveTurnEnd', () => {
  it('bleeds a poisoned target by a share of its maximum', () => {
    const { hpDelta } = resolveTurnEnd([{ kind: 'poison', turns: 3 }], 100);
    expect(hpDelta).toBe(-Math.round(100 * POISON_FRACTION));
  });

  it('mends a regenerating target by a share of its maximum', () => {
    const { hpDelta } = resolveTurnEnd([{ kind: 'regen', turns: 3 }], 100);
    expect(hpDelta).toBe(Math.round(100 * REGEN_FRACTION));
  });

  it('nets poison against regen', () => {
    const { hpDelta } = resolveTurnEnd(
      [{ kind: 'poison', turns: 3 }, { kind: 'regen', turns: 3 }],
      100
    );
    expect(hpDelta).toBe(Math.round(100 * REGEN_FRACTION) - Math.round(100 * POISON_FRACTION));
  });

  it('always bleeds at least one point, however small the target', () => {
    // A 4 HP target rounds to zero poison damage, which would read on screen
    // as a status that does nothing.
    const { hpDelta } = resolveTurnEnd([{ kind: 'poison', turns: 3 }], 4);
    expect(hpDelta).toBe(-1);
  });

  it('counts the turn down', () => {
    const { statuses } = resolveTurnEnd([{ kind: 'poison', turns: 3 }], 100);
    expect(statuses).toEqual([{ kind: 'poison', turns: 2 }]);
  });

  it('drops a status that ran out, and says which', () => {
    const { statuses, expired } = resolveTurnEnd(
      [{ kind: 'poison', turns: 1 }, { kind: 'regen', turns: 2 }],
      100
    );
    expect(statuses).toEqual([{ kind: 'regen', turns: 1 }]);
    expect(expired).toEqual(['poison']);
  });

  it('does nothing to a clean target', () => {
    expect(resolveTurnEnd([], 100)).toEqual({ statuses: [], hpDelta: 0, expired: [] });
  });
});
