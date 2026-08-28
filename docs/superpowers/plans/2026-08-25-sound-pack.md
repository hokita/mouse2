# Sound Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add twelve synthesized sound effects and one boss music loop, and route Sigil's combat sounds through a pure, tested mapper instead of inline ternaries in the scene.

**Architecture:** Sounds are data — a `durationSec`, a `volume`, and a `render` function that writes voices into a `BaseAudioContext` — so adding one is a registry entry, not code. `sfx.ts` becomes a directory split by game. A new pure module, `src/core/rpg/voice.ts`, answers "which sound does this battle event make?" so that decision is unit-testable without Phaser. Scene changes are then thin: look up a name, call `playSfx`.

**Tech Stack:** TypeScript, Phaser 3, Vitest, Web Audio (`OfflineAudioContext` at boot via `src/audio/bus.ts`). No binary assets — every sound is synthesized in code.

**Spec:** `docs/superpowers/specs/2026-08-25-sound-pack-design.md`

## Global Constraints

- **No binary audio assets.** Every sound is built from `tone()` and `noise()` in `src/audio/synth.ts`. Never add a file to load.
- **`durationSec` must cover the last voice's tail** or the render truncates it. `tone()` stops at `start + duration + 0.01`; `noise()` stops at `start + duration`.
- **Note names have no flats.** `NOTE_PATTERN` in `src/audio/notes.ts:30` is `/^([A-G]#?)(-?\d+)$/`. Write `D#1`, never `Eb1`.
- **Music loops are exactly 32 steps** in each of `bass`, `lead` and `drums`, at 100–120 bpm, looping in 8–10 seconds. `src/audio/__tests__/music.test.ts` enforces this over every entry.
- **Audio is never load-bearing.** `playSfx` and `playMusic` no-op when a buffer is missing or the player has muted. Nothing in a scene may depend on a sound having played.
- **Test command:** `pnpm test` (runs `vitest run`). Single file: `pnpm vitest run <path>`. Type check: `pnpm exec tsc --noEmit`.
- **Commit after every task.** The repo's convention is a short imperative subject line.

---

### Task 1: The sound-registry invariant test

The file header of `sfx.ts` has always claimed that `durationSec` must cover the last voice's tail, and nothing has ever checked it. A truncated tail is inaudible until someone listens for it. This test comes first so it guards every later task — the twelve sounds added in Tasks 3 and 4 are covered the moment they are written, with no per-sound test to author.

**Files:**
- Test: `src/audio/__tests__/sfx.test.ts` (create)

**Interfaces:**
- Consumes: `SFX` from `src/audio/sfx.ts` (existing).
- Produces: nothing importable. Later tasks rely on this test existing and being table-driven over `SFX`.

- [ ] **Step 1: Write the test**

Create `src/audio/__tests__/sfx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SFX } from '../sfx';

// SFX entries are data, but their shape is only visible by running them: a
// render function schedules voices into whatever context it is handed. This
// fake is that context, recording start/stop times and nothing else, which
// is enough to check the one invariant the file header states and TypeScript
// cannot — that durationSec is long enough to hold every voice.
//
// It implements exactly the surface synth.ts touches. If synth.ts grows a new
// node type, this fake fails loudly rather than silently missing voices.

interface Scheduled {
  start: number;
  stop: number;
}

class FakeParam {
  setValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
}

class FakeNode {
  // synth.ts chains `a.connect(b).connect(dest)`, so connect returns its
  // argument the way the real AudioNode.connect does.
  connect(next: FakeNode): FakeNode {
    return next;
  }
}

class FakeSource extends FakeNode {
  type = '';
  buffer: unknown = null;
  readonly frequency = new FakeParam();
  readonly gain = new FakeParam();
  private record: Scheduled | null = null;

  constructor(private readonly log: Scheduled[]) {
    super();
  }

  start(at: number): void {
    this.record = { start: at, stop: at };
    this.log.push(this.record);
  }

  stop(at: number): void {
    if (this.record !== null) {
      this.record.stop = at;
    }
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = '';
  readonly frequency = new FakeParam();
}

class FakeContext {
  readonly sampleRate = 48000;
  readonly scheduled: Scheduled[] = [];

  createOscillator(): FakeSource {
    return new FakeSource(this.scheduled);
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this.scheduled);
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createBuffer(_channels: number, frames: number): { getChannelData(): Float32Array } {
    const data = new Float32Array(frames);
    return { getChannelData: () => data };
  }
}

describe.each(Object.entries(SFX))('SFX.%s', (_name, spec) => {
  it('fits every voice inside its durationSec', () => {
    const ctx = new FakeContext();
    spec.render(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode);

    expect(ctx.scheduled.length).toBeGreaterThan(0);
    const end = Math.max(...ctx.scheduled.map((voice) => voice.stop));
    expect(end).toBeLessThanOrEqual(spec.durationSec);
  });

  it('plays at a volume between 0 and 1', () => {
    expect(spec.volume).toBeGreaterThan(0);
    expect(spec.volume).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it passes against today's 22 sounds**

Run: `pnpm vitest run src/audio/__tests__/sfx.test.ts`
Expected: PASS, 44 tests (22 sounds × 2).

If any sound fails, that is a real pre-existing bug — a clipped tail. Fix it by raising that entry's `durationSec` to just past the reported end, and mention it in the commit body. Do not lower the assertion.

- [ ] **Step 3: Prove the test can fail**

A test that has never been red proves nothing. Temporarily change `tap`'s `durationSec` in `src/audio/sfx.ts` from `0.12` to `0.05`.

Run: `pnpm vitest run src/audio/__tests__/sfx.test.ts`
Expected: FAIL — `SFX.tap > fits every voice inside its durationSec`, expected 0.08 to be ≤ 0.05.

- [ ] **Step 4: Revert the mutation**

Put `tap`'s `durationSec` back to `0.12`.

Run: `pnpm vitest run src/audio/__tests__/sfx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/__tests__/sfx.test.ts
git commit -m "Check that every sound fits inside its own durationSec"
```

---

### Task 2: Split `sfx.ts` into a directory

581 lines today; twelve more entries would push it past 950. Do this before adding sounds so the new ones are written once, in their final home.

This is a pure move: no render function changes, no behaviour change. Task 1's test is the guard — it runs over whatever `SFX` ends up containing, so a sound lost in the move fails the suite.

**Files:**
- Create: `src/audio/sfx/spec.ts`, `src/audio/sfx/index.ts`, `src/audio/sfx/shared.ts`, `src/audio/sfx/dodger.ts`, `src/audio/sfx/car.ts`, `src/audio/sfx/fishing.ts`, `src/audio/sfx/sigil.ts`
- Delete: `src/audio/sfx.ts`
- Test: `src/audio/__tests__/sfx.test.ts` (unchanged — it imports `../sfx`, which now resolves to `sfx/index.ts`)

**Interfaces:**
- Produces: `SfxSpec` (from `sfx/spec.ts`, re-exported by `sfx/index.ts`), `SFX`, and `SfxName = keyof typeof SFX`. `src/audio/bus.ts` keeps importing both from `'./sfx'` with no edit.

- [ ] **Step 1: Create `src/audio/sfx/spec.ts`**

`SfxSpec` lives in its own file so the per-game modules and `index.ts` can both import it without a cycle.

```ts
export interface SfxSpec {
  durationSec: number;
  volume: number;
  render(ctx: BaseAudioContext, dest: AudioNode): void;
}
```

- [ ] **Step 2: Move the entries into per-game modules**

Cut each entry from `src/audio/sfx.ts` verbatim — the render bodies and their comments are unchanged — into these five files. Each file opens with the imports it needs (`noteToFreq` from `'../notes'`, `noise`/`tone` from `'../synth'`, `SfxSpec` from `'./spec'`) and closes with `satisfies Record<string, SfxSpec>`, which keeps the literal key names so `SfxName` stays a precise union.

| File | Export | Entries moved |
|---|---|---|
| `shared.ts` | `SHARED` | `tap`, `launch`, `gameover` |
| `dodger.ts` | `DODGER` | `shoot`, `explode`, `hurt` |
| `car.ts` | `CAR` | `crash`, `milestone` |
| `fishing.ts` | `FISHING` | `catch`, `rare`, `trash`, `plop`, `bite`, `snap`, `levelup`, `timeup` |
| `sigil.ts` | `SIGIL` | `slash`, `cast`, `weak`, `guard`, `heal`, `afflict` |

The shape of each file, using `shared.ts` as the example:

```ts
import { noteToFreq } from '../notes';
import { noise, tone } from '../synth';
import type { SfxSpec } from './spec';

// Sounds that belong to no single game: the menu's tap, the transition into
// a run, and the sting that ends one.

export const SHARED = {
  tap: {
    durationSec: 0.12,
    volume: 0.45,
    render(ctx, dest) {
      // ...unchanged body...
    },
  },
  // launch, gameover
} satisfies Record<string, SfxSpec>;
```

Note: `launch` and `gameover` do not use `noise`, `car.ts` does not use `noteToFreq`, and so on — import only what each file actually calls, or `tsc` will complain about unused imports under the repo's settings.

- [ ] **Step 3: Create `src/audio/sfx/index.ts`**

```ts
import { CAR } from './car';
import { DODGER } from './dodger';
import { FISHING } from './fishing';
import { SHARED } from './shared';
import { SIGIL } from './sigil';

export type { SfxSpec } from './spec';

// The whole vocabulary of the game, one module per game plus the shared few.
//
// `volume` is the playback level, not the render level. It is per-effect
// because these are not equals: the all-clear fanfare wants the room, and the
// Dodger auto-fire tick wants to disappear into it.
export const SFX = {
  ...SHARED,
  ...DODGER,
  ...CAR,
  ...FISHING,
  ...SIGIL,
};

export type SfxName = keyof typeof SFX;
```

- [ ] **Step 4: Delete the old file**

```bash
git rm src/audio/sfx.ts
```

- [ ] **Step 5: Verify nothing moved or vanished**

Run: `pnpm vitest run src/audio/__tests__/sfx.test.ts`
Expected: PASS, still 44 tests. A different count means an entry was dropped or duplicated in the move.

Run: `pnpm exec tsc --noEmit`
Expected: no output. This is what proves `SfxName` is still the same union — `bus.ts` and every `playSfx('...')` call site are checked against it.

- [ ] **Step 6: Commit**

```bash
git add src/audio/sfx src/audio/__tests__/sfx.test.ts
git commit -m "Split the sound catalog into one module per game"
```

---

### Task 3: The two shared sounds — `allclear` and `warning`

**Files:**
- Modify: `src/audio/sfx/shared.ts`
- Test: `src/audio/__tests__/sfx.test.ts` (no edit — it picks these up automatically)

**Interfaces:**
- Produces: `'allclear'` and `'warning'` as members of `SfxName`. Tasks 8 and 9 play them.

- [ ] **Step 1: Add both entries to `SHARED`**

Append inside the `SHARED` object in `src/audio/sfx/shared.ts`:

```ts
  allclear: {
    durationSec: 1.7,
    volume: 0.65,
    render(ctx, dest) {
      // The loudest thing in the game, and the longest. It plays at most once
      // per run — after that there is nothing left to hear — so unlike every
      // other sound here it does not have to share the room with anything.
      //
      // A run-up and then a landing: three staccato steps up the triad, then
      // a chord that simply holds. The hold is the part that says finished;
      // an arpeggio alone would sound like a level-up, which is a sound this
      // game already has and which means something smaller.
      for (const [note, start] of [['D5', 0], ['F#5', 0.12], ['A5', 0.24]] as const) {
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq(note),
          start,
          duration: 0.13,
          gain: 0.34,
          attack: 0.04,
        });
        tone(ctx, dest, {
          type: 'triangle',
          freq: noteToFreq(note) / 2,
          start,
          duration: 0.13,
          gain: 0.2,
          attack: 0.04,
        });
      }
      for (const [note, gain] of [['D6', 0.3], ['A5', 0.24], ['D4', 0.28]] as const) {
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq(note),
          start: 0.42,
          duration: 1.1,
          gain,
          attack: 0.04,
        });
      }
      noise(ctx, dest, {
        start: 0.42,
        duration: 0.4,
        gain: 0.2,
        filterStart: 6000,
        filterEnd: 700,
      });
    },
  },

  warning: {
    durationSec: 1.0,
    volume: 0.5,
    render(ctx, dest) {
      // Two notes a tritone apart, alternating three times. A siren, not a
      // melody: it is the only sound in the game that means something is
      // coming rather than something happened, and it is deliberately not
      // pretty.
      for (let i = 0; i < 3; i += 1) {
        const start = i * 0.3;
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq('A4'),
          start,
          duration: 0.14,
          gain: 0.3,
          attack: 0.06,
        });
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq('D#4'),
          start: start + 0.15,
          duration: 0.14,
          gain: 0.3,
          attack: 0.06,
        });
      }
    },
  },
```

- [ ] **Step 2: Run the registry test**

Run: `pnpm vitest run src/audio/__tests__/sfx.test.ts`
Expected: PASS, now 48 tests. `allclear`'s last voice ends at 1.52 and `warning`'s at 0.89, both inside their `durationSec`.

- [ ] **Step 3: Commit**

```bash
git add src/audio/sfx/shared.ts
git commit -m "Add the all-clear fanfare and the boss warning siren"
```

---

### Task 4: The ten Sigil sounds

**Files:**
- Modify: `src/audio/sfx/sigil.ts`
- Test: `src/audio/__tests__/sfx.test.ts` (no edit)

**Interfaces:**
- Produces: `'castFire'`, `'castWater'`, `'castLeaf'`, `'heavy'`, `'sweep'`, `'growl'`, `'fell'`, `'downed'`, `'restore'`, `'cure'` as members of `SfxName`. Task 5's mapper returns these names.

- [ ] **Step 1: Add the three elemental casts**

Append inside the `SIGIL` object. Keep them next to the existing `cast`, whose comment should be amended to say it is now specifically the colourless magic — `force`, `nova`, `pulse`, `mend`, `chorus` — rather than every spell.

```ts
  castFire: {
    durationSec: 0.36,
    volume: 0.42,
    render(ctx, dest) {
      // A crackle. The filter opens rather than closes, which is what makes
      // this the opposite of an impact: something catching, not something
      // landing.
      noise(ctx, dest, {
        start: 0,
        duration: 0.3,
        gain: 0.3,
        filterStart: 700,
        filterEnd: 5200,
      });
      tone(ctx, dest, {
        type: 'sawtooth',
        freq: noteToFreq('D3'),
        endFreq: noteToFreq('A4'),
        start: 0,
        duration: 0.26,
        gain: 0.2,
        attack: 0.12,
      });
    },
  },

  castWater: {
    durationSec: 0.4,
    volume: 0.42,
    render(ctx, dest) {
      // A wash: the same opening filter as fire, but slower and darker, with
      // a sine falling through it. Fire rises and water falls, so the two are
      // told apart by contour before anyone notices the timbre.
      noise(ctx, dest, {
        start: 0,
        duration: 0.34,
        gain: 0.26,
        filterStart: 400,
        filterEnd: 2600,
      });
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('A5'),
        endFreq: noteToFreq('D4'),
        start: 0.02,
        duration: 0.3,
        gain: 0.3,
        attack: 0.14,
      });
    },
  },

  castLeaf: {
    durationSec: 0.4,
    volume: 0.4,
    render(ctx, dest) {
      // Growth: three discrete steps up rather than a sweep. Fire and water
      // both slide; leaf is the one that climbs in stages.
      for (const [note, start] of [['D4', 0], ['G4', 0.07], ['B4', 0.14]] as const) {
        tone(ctx, dest, {
          type: 'triangle',
          freq: noteToFreq(note),
          start,
          duration: 0.16,
          gain: 0.3,
          attack: 0.1,
        });
      }
      noise(ctx, dest, {
        start: 0.1,
        duration: 0.2,
        gain: 0.08,
        filterStart: 3000,
        filterEnd: 900,
      });
    },
  },
```

- [ ] **Step 2: Add the two heavier impacts**

Put these directly after `slash`, which they are variants of.

```ts
  heavy: {
    durationSec: 0.36,
    volume: 0.5,
    render(ctx, dest) {
      // `slash` with a body under it. Same steel on top so the family reads
      // as one thing at three weights; the low sine is the whole difference
      // between a hit and a hit that moved something.
      noise(ctx, dest, {
        start: 0,
        duration: 0.18,
        gain: 0.34,
        filterStart: 6000,
        filterEnd: 600,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A3'),
        endFreq: noteToFreq('D3'),
        start: 0,
        duration: 0.16,
        gain: 0.3,
        attack: 0.02,
      });
      tone(ctx, dest, {
        type: 'sine',
        freq: 140,
        endFreq: 55,
        start: 0.04,
        duration: 0.28,
        gain: 0.45,
        attack: 0.03,
      });
    },
  },

  sweep: {
    durationSec: 0.26,
    volume: 0.44,
    render(ctx, dest) {
      // Wider and shorter than `slash`, because a spread hit is heard three
      // times in a row — one per target, a beat apart. Anything with a tail
      // would smear into the next one.
      noise(ctx, dest, {
        start: 0,
        duration: 0.2,
        gain: 0.3,
        filterStart: 9000,
        filterEnd: 1800,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('D5'),
        endFreq: noteToFreq('A4'),
        start: 0,
        duration: 0.12,
        gain: 0.24,
        attack: 0.02,
      });
    },
  },
```

- [ ] **Step 3: Add the monster's voice and the four stings**

```ts
  growl: {
    durationSec: 0.38,
    volume: 0.4,
    render(ctx, dest) {
      // Two saws a few cents apart, the same trick `hurt` uses: the beating
      // between them is the "wrong" in the sound. A monster taking its turn
      // and a hero taking damage are the two things in this fight that are
      // bad news, so they share a family.
      for (const [freq, endFreq, gain] of [[86, 62, 0.34], [91, 65, 0.24]] as const) {
        tone(ctx, dest, {
          type: 'sawtooth',
          freq,
          endFreq,
          start: 0,
          duration: 0.3,
          gain,
          attack: 0.14,
        });
      }
      noise(ctx, dest, {
        start: 0.02,
        duration: 0.26,
        gain: 0.12,
        filterStart: 1200,
        filterEnd: 300,
      });
    },
  },

  fell: {
    durationSec: 0.5,
    volume: 0.45,
    render(ctx, dest) {
      // A monster dropping. Three steps down and a thud — the same descending
      // shape as `gameover`, which is what this used to borrow, but faster,
      // higher and over in half the time. One blob dying is not the run
      // ending, and the player should never have to check the screen to know
      // which just happened.
      for (const [note, start] of [['A4', 0], ['E4', 0.08], ['A3', 0.16]] as const) {
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq(note),
          start,
          duration: 0.14,
          gain: 0.3,
          attack: 0.04,
        });
      }
      noise(ctx, dest, {
        start: 0.16,
        duration: 0.24,
        gain: 0.22,
        filterStart: 1800,
        filterEnd: 160,
      });
    },
  },

  downed: {
    durationSec: 0.7,
    volume: 0.55,
    render(ctx, dest) {
      // A hero dropping: one long sag with no steps in it, ending lower than
      // anything else in the fight. Where `fell` is an event, this is a loss.
      tone(ctx, dest, {
        type: 'sawtooth',
        freq: noteToFreq('A3'),
        endFreq: noteToFreq('D2'),
        start: 0,
        duration: 0.5,
        gain: 0.3,
        attack: 0.06,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A2'),
        endFreq: noteToFreq('D2'),
        start: 0.06,
        duration: 0.46,
        gain: 0.26,
        attack: 0.06,
      });
      noise(ctx, dest, {
        start: 0,
        duration: 0.3,
        gain: 0.18,
        filterStart: 1400,
        filterEnd: 120,
      });
    },
  },

  restore: {
    durationSec: 0.25,
    volume: 0.4,
    render(ctx, dest) {
      // MP coming back. Thinner and shorter than `heal`, and rising where
      // `heal` steps: the two used to be the same sound, so they have to be
      // told apart on the first note.
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('A5'),
        endFreq: noteToFreq('E6'),
        start: 0,
        duration: 0.14,
        gain: 0.32,
        attack: 0.12,
      });
    },
  },

  cure: {
    durationSec: 0.42,
    volume: 0.42,
    render(ctx, dest) {
      // A bell: near-instant attack, long decay, no pitch movement at all.
      // Nothing else in the fight is struck like this, which is what makes an
      // ailment coming off legible as its own event rather than as healing.
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('D6'),
        start: 0,
        duration: 0.34,
        gain: 0.26,
        attack: 0.02,
      });
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('A6'),
        start: 0,
        duration: 0.2,
        gain: 0.12,
        attack: 0.02,
      });
    },
  },
```

- [ ] **Step 4: Correct the two stale comments**

In `src/audio/sfx/index.ts`, the header comment inherited from the old file says "sixteen sounds". There are 34 now. Say 34, or say nothing about the count — a number that has been wrong twice is not worth keeping a third time.

In `src/audio/sfx/sigil.ts`, `weak`'s comment claims it is "the loudest thing in the game". `allclear` is, at 0.65. Change it to "the loudest thing in a fight".

- [ ] **Step 5: Run the registry test**

Run: `pnpm vitest run src/audio/__tests__/sfx.test.ts`
Expected: PASS, now 68 tests (34 sounds × 2).

- [ ] **Step 6: Commit**

```bash
git add src/audio/sfx
git commit -m "Give Sigil an elemental cast, a weighted swing and a monster's voice"
```

---

### Task 5: The mapper — `src/core/rpg/voice.ts`

Pure functions, no Phaser, tested directly. This is where "which sound?" stops being a ternary buried in a 100-line switch inside a view.

**Files:**
- Create: `src/core/rpg/voice.ts`
- Test: `src/core/rpg/__tests__/voice.test.ts` (create)

**Interfaces:**
- Consumes: `SfxName` from `src/audio/sfx` (type-only — erased at compile, so `core/` gains no runtime dependency on the audio layer); `Skill`, `SKILLS` from `./skills`; `BattleEvent`, `Side` from `./battle`.
- Produces:
  - `voiceForAct(skill: Skill | null, actorSide: Side): SfxName | null`
  - `voiceForEvent(event: BattleEvent, skill: Skill | null, subjectSide: Side): SfxName | null`

  Both return `null` for "no sound", which is a real answer: a free swing's wind-up is silent because the swing is heard as its impact. Task 6 calls both.

- [ ] **Step 1: Write the failing test**

Create `src/core/rpg/__tests__/voice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SFX } from '../../../audio/sfx';
import { SKILLS } from '../skills';
import { voiceForAct, voiceForEvent } from '../voice';
import type { BattleEvent } from '../battle';

const damage = (band: 'weak' | 'normal' | 'resist'): BattleEvent => ({
  type: 'damage',
  target: 'foe:0',
  amount: 12,
  band,
  element: 'plain',
});

describe('voiceForAct', () => {
  it('gives every monster the same voice, whatever it is doing', () => {
    expect(voiceForAct(SKILLS.strike, 'foes')).toBe('growl');
    expect(voiceForAct(SKILLS.scorch, 'foes')).toBe('growl');
    expect(voiceForAct(null, 'foes')).toBe('growl');
  });

  it('names the element on a hero’s spell', () => {
    expect(voiceForAct(SKILLS.flare, 'party')).toBe('castFire');
    expect(voiceForAct(SKILLS.torrent, 'party')).toBe('castWater');
    expect(voiceForAct(SKILLS.thorn, 'party')).toBe('castLeaf');
  });

  it('keeps the colourless spells on the plain cast', () => {
    expect(voiceForAct(SKILLS.nova, 'party')).toBe('cast');
    expect(voiceForAct(SKILLS.mend, 'party')).toBe('cast');
  });

  it('stays silent on a hero’s free swing, which is heard as its impact', () => {
    expect(voiceForAct(SKILLS.strike, 'party')).toBeNull();
  });

  it('stays silent when a hero uses an item, which has no skill', () => {
    expect(voiceForAct(null, 'party')).toBeNull();
  });
});

describe('voiceForEvent', () => {
  it('keeps the weakness cue whatever the skill was', () => {
    expect(voiceForEvent(damage('weak'), SKILLS.crush, 'foes')).toBe('weak');
    expect(voiceForEvent(damage('weak'), SKILLS.bite, 'party')).toBe('weak');
  });

  it('weights a hit on a monster by the skill’s tier', () => {
    expect(voiceForEvent(damage('normal'), SKILLS.hew, 'foes')).toBe('slash');
    expect(voiceForEvent(damage('normal'), SKILLS.crush, 'foes')).toBe('heavy');
    expect(voiceForEvent(damage('normal'), SKILLS.cleave, 'foes')).toBe('sweep');
  });

  it('falls back to the plain hit when no skill is known', () => {
    expect(voiceForEvent(damage('normal'), null, 'foes')).toBe('slash');
  });

  it('does not weight a hit on a hero — being hurt is being hurt', () => {
    expect(voiceForEvent(damage('normal'), SKILLS.gnash, 'party')).toBe('hurt');
  });

  it('tells a monster falling apart from a hero falling', () => {
    expect(voiceForEvent({ type: 'down', target: 'foe:0' }, null, 'foes')).toBe('fell');
    expect(voiceForEvent({ type: 'down', target: 'hero:mother' }, null, 'party')).toBe('downed');
  });

  it('separates healing, restoring and curing', () => {
    expect(voiceForEvent({ type: 'heal', target: 'hero:mother', amount: 20 }, null, 'party')).toBe(
      'heal'
    );
    expect(voiceForEvent({ type: 'mp', target: 'hero:mother', amount: 8 }, null, 'party')).toBe(
      'restore'
    );
    expect(
      voiceForEvent({ type: 'cured', target: 'hero:mother', cleared: ['poison'] }, null, 'party')
    ).toBe('cure');
  });

  it('reports a cure that found nothing as a nothing', () => {
    expect(
      voiceForEvent({ type: 'cured', target: 'hero:mother', cleared: [] }, null, 'party')
    ).toBe('guard');
  });

  it('says nothing about bookkeeping events', () => {
    expect(voiceForEvent({ type: 'outcome', outcome: 'won' }, null, 'foes')).toBeNull();
    expect(
      voiceForEvent({ type: 'statusExpired', target: 'foe:0', status: 'poison' }, null, 'foes')
    ).toBeNull();
  });
});

// The mapper returns names as strings; nothing in the type system stops it
// returning one that was never added to SFX. This is the check that would
// have caught a typo'd 'castfire' before it reached a player as silence.
describe('every skill resolves to a sound that exists', () => {
  it.each(Object.values(SKILLS))('$id', (skill) => {
    for (const side of ['party', 'foes'] as const) {
      const act = voiceForAct(skill, side);
      if (act !== null) {
        expect(SFX).toHaveProperty(act);
      }
      const hit = voiceForEvent(damage('normal'), skill, side);
      if (hit !== null) {
        expect(SFX).toHaveProperty(hit);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/core/rpg/__tests__/voice.test.ts`
Expected: FAIL — cannot resolve `../voice`.

- [ ] **Step 3: Write the mapper**

Create `src/core/rpg/voice.ts`:

```ts
import type { SfxName } from '../../audio/sfx';
import type { BattleEvent, Side } from './battle';
import type { CastableElement } from './elements';
import type { Skill, SkillTier } from './skills';

// Which sound a beat of a fight makes.
//
// This lives here rather than in BattleScene because it is a decision, not a
// drawing: it depends on the skill's tier, its element and whose turn it is,
// and all three of those are rules the scene should not be re-deriving. The
// scene's job is to know that a sound plays; this file's job is to know which.
//
// `null` is a real answer, not a failure. A hero's free swing makes no sound
// on the wind-up because it is heard as its impact a beat later, and a mapper
// that invented something for every event would be a mapper nobody could tell
// was wrong.

const CAST_BY_ELEMENT: Record<CastableElement, SfxName> = {
  fire: 'castFire',
  water: 'castWater',
  leaf: 'castLeaf',
};

// Weight, not steel. A spread *spell* lands on `sweep` too — the damage
// number already says which element caused it, so the sound is free to say
// the one thing the number cannot, which is how hard.
const IMPACT_BY_TIER: Record<SkillTier, SfxName> = {
  normal: 'slash',
  strong: 'heavy',
  spread: 'sweep',
};

/**
 * The wind-up, played as a turn begins. `skill` is null when the actor used
 * an item, which carries no skill.
 */
export function voiceForAct(skill: Skill | null, actorSide: Side): SfxName | null {
  // Heroes and monsters share the SKILLS table, which is right for the
  // resolver and wrong for the ear: without this, a salamander casting
  // `scorch` would play the party's own fire spell back at the player.
  if (actorSide === 'foes') {
    return 'growl';
  }
  if (skill === null || skill.mpCost === 0) {
    return null;
  }
  return skill.element === 'plain' ? 'cast' : CAST_BY_ELEMENT[skill.element];
}

/**
 * Everything that happens after the wind-up. `skill` is the one the acting
 * combatant is currently resolving — damage events do not carry it, so the
 * caller remembers the last `act`.
 *
 * `subjectSide` is the side of whoever the event is about: its target, or its
 * actor for the events that have no target.
 */
export function voiceForEvent(
  event: BattleEvent,
  skill: Skill | null,
  subjectSide: Side
): SfxName | null {
  switch (event.type) {
    case 'damage':
      // The weakness cue outranks everything. It is the only rule the game
      // teaches, it teaches it without text, and nothing added since is
      // allowed to blur it.
      if (event.band === 'weak') {
        return 'weak';
      }
      // A hero being hit is not graded by how hard: from the receiving end
      // there is no difference worth hearing between a bite and a gnash.
      return subjectSide === 'party' ? 'hurt' : IMPACT_BY_TIER[skill?.tier ?? 'normal'];
    case 'heal':
      return 'heal';
    case 'mp':
      return 'restore';
    case 'status':
      return 'afflict';
    case 'statusFailed':
      return 'guard';
    case 'cured':
      return event.cleared.length > 0 ? 'cure' : 'guard';
    case 'guard':
      return 'guard';
    case 'down':
      return subjectSide === 'foes' ? 'fell' : 'downed';
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/core/rpg/__tests__/voice.test.ts`
Expected: PASS.

`SkillTier` (`skills.ts:25`) and `CastableElement` (`elements.ts:24`) are both already exported, so import them rather than re-declaring either union here — a second copy of the tier list is exactly the drift `elements.ts` warns about.

- [ ] **Step 5: Commit**

```bash
git add src/core/rpg/voice.ts src/core/rpg/__tests__/voice.test.ts
git commit -m "Decide Sigil's combat sounds in one tested place"
```

---

### Task 6: Route `BattleScene` through the mapper

**Files:**
- Modify: `src/scenes/BattleScene.ts` — `playEvent` (`:424`) and the `playEvents` walk (`:321`)

**Interfaces:**
- Consumes: `voiceForAct`, `voiceForEvent` from `../core/rpg/voice`.
- Produces: no exports. `BattleSceneData` is extended in Task 8, not here.

- [ ] **Step 1: Add the imports and the remembered skill**

```ts
import { voiceForAct, voiceForEvent } from '../core/rpg/voice';
import type { Skill } from '../core/rpg/skills';
import type { Side } from '../core/rpg/battle';
```

`SKILLS` and `playSfx` are already imported in this file — the `act` case uses
both today.

Add a field beside the other per-turn state:

```ts
  /**
   * The skill currently resolving. Damage events do not carry one, but `act`
   * always precedes its damage inside the same playEvents walk, so this is
   * where the tier comes from when a hit lands.
   */
  private acting: Skill | null = null;
```

Reset it to `null` in `init()`, next to `this.busy = false`. Scene instances outlive their scenes here, so anything mutable is rebuilt there.

- [ ] **Step 2: Add a side lookup**

`this.find(id)` already returns the display combatant. Add beside it:

```ts
  /**
   * Whose side an event is about. Combatant ids are `hero:<id>` or
   * `foe:<index>`, so the prefix is the fallback when the combatant has
   * already left the display copy.
   */
  private sideOf(id: string): Side {
    return this.find(id)?.side ?? (id.startsWith('foe:') ? 'foes' : 'party');
  }
```

- [ ] **Step 3: Play the sound once, at the top of `playEvent`**

Replace the opening of `playEvent` so the sound is chosen in one place, then leave every `case` doing only its drawing:

```ts
  private playEvent(event: BattleEvent): void {
    if (event.type === 'act') {
      this.acting = event.skill ? SKILLS[event.skill] : null;
      const wind = voiceForAct(this.acting, this.sideOf(event.actor));
      if (wind !== null) {
        playSfx(this, wind);
      }
      return;
    }

    const subject = 'target' in event ? event.target : 'actor' in event ? event.actor : null;
    const voice = voiceForEvent(event, this.acting, subject === null ? 'party' : this.sideOf(subject));
    if (voice !== null) {
      playSfx(this, voice);
    }

    switch (event.type) {
      // ...unchanged cases, with every playSfx call removed...
    }
  }
```

Then delete these ten now-duplicated calls from inside the switch: `weak` and the `hurt`/`slash` ternary in `damage` (keep the camera shake on `weak`), `heal` in both `heal` and `mp`, `afflict` in `status`, `guard` in `statusFailed`, the `heal`/`guard` ternary in `cured`, `guard` in `guard`, and `gameover` in `down`.

Two deliberate behaviour changes fall out of this, both wanted:

1. The `damage` case returns early when `this.find(event.target)` misses, which today also swallows the sound. A hit that resolved should be heard even if there is nothing left on screen to draw a number over.
2. `down` no longer plays `gameover`. That sting now means only "the run is over", which is what it sounds like.

Leave `finish()` (`:661`) alone — it keeps `levelup`/`gameover`. A single fight ending is not an all-clear.

- [ ] **Step 4: Verify**

Run: `pnpm test`
Expected: PASS. No existing test asserts on sounds, so this is a regression check on everything else.

Run: `pnpm exec tsc --noEmit`
Expected: no output. This is what catches a `case` left holding a variable that only the deleted `playSfx` line used.

- [ ] **Step 5: Play it**

Run: `pnpm dev`, open Sigil, and take one fight to the end. Confirm by ear: a monster's turn growls before it swings; `crush` lands heavier than `hew`; a blob dying no longer sounds like the run ending; a potion on a poisoned hero rings rather than chimes like a heal.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "Play Sigil's fight through the voice mapper"
```

---

### Task 7: The boss loop

**Files:**
- Modify: `src/audio/music.ts` — add to `MusicName` (`:12`) and to `MUSIC` (`:30`)
- Test: `src/audio/__tests__/music.test.ts` (no edit — it is already `describe.each` over `MUSIC`)

**Interfaces:**
- Produces: `'boss'` as a member of `MusicName`. Task 8 plays it.

- [ ] **Step 1: Extend the name union**

```ts
export type MusicName = 'menu' | 'dodger' | 'car' | 'fish' | 'reel' | 'quest' | 'battle' | 'boss';
```

- [ ] **Step 2: Add the loop**

Append to `MUSIC`, after `battle`:

```ts
  // The boss, in both games. A pedal that never resolves, the only saw lead
  // in the cartridge, and a kick on every beat instead of every other one —
  // three ways of saying the same thing, so the switch reads inside a bar
  // even on a phone speaker.
  boss: {
    bpm: 118,
    leadType: 'sawtooth',
    leadGain: 0.12,
    bass: [
      'D1', _, 'D1', _, 'D1', _, 'D#1', _,
      'D1', _, 'D1', _, 'D1', _, 'D#1', _,
      'D1', _, 'D1', _, 'G#1', _, 'G#1', _,
      'D1', _, 'D1', _, 'A1', _, 'A1', _,
    ],
    lead: [
      'D4', _, 'F4', _, 'G#4', _, 'F4', _,
      'D4', _, 'F4', _, 'A4', _, 'G#4', _,
      'D5', _, 'A4', _, 'G#4', _, 'F4', _,
      'D4', 'F4', 'G#4', 'A4', 'A#4', _, 'A4', _,
    ],
    drums: [
      k, h, k, h, k, h, k, h,
      k, h, k, h, k, h, k, h,
      k, h, k, h, k, h, k, h,
      k, h, k, h, k, h, k, k,
    ],
  },
```

The G#4 against the D pedal is the tritone the whole loop leans on, and the D#1 in the bass is the minor second that refuses to resolve. `D#`, not `Eb` — the note parser has no flats.

- [ ] **Step 3: Update the header comment**

`music.ts` opens with "Seven loops, three tracks each". It is eight now.

- [ ] **Step 4: Run the music suite**

Run: `pnpm vitest run src/audio/__tests__/music.test.ts`
Expected: PASS, four new tests for `MUSIC.boss`. The loop-length assertion is the one to watch: 32 eighth notes at 118 bpm is 8.14 s, inside the 8–10 s window. A miscounted array fails the 32-step assertion rather than shipping a loop with a seam in it.

- [ ] **Step 5: Commit**

```bash
git add src/audio/music.ts
git commit -m "Add a boss loop: a pedal that will not resolve"
```

---

### Task 8: Bring the boss music in

**Files:**
- Modify: `src/scenes/GameScene.ts:782` (`startBossArrival`)
- Modify: `src/scenes/BattleScene.ts` — `BattleSceneData` (`:78`), `init` (`:120`), `create` (`:159`)
- Modify: `src/scenes/QuestScene.ts:349` (the battle launch)

**Interfaces:**
- Consumes: `'warning'` (Task 3), `'boss'` (Task 7).
- Produces: `BattleSceneData.boss?: boolean`.

- [ ] **Step 1: Dodger's arrival**

In `startBossArrival`, replace the borrowed `levelup` and take the music over:

```ts
  private startBossArrival(): void {
    this.runPhase = 'incoming';
    this.boss = spawnBoss(this);
    playSfx(this, 'warning');
    playMusic(this, 'boss');
    this.cameras.main.flash(220, 255, 95, 126);
    this.cameras.main.shake(300, 0.006);
  }
```

`playMusic` cuts the outgoing loop and fades the new one in over `MUSIC_FADE_MS`. The cut is right here — the arrival already flashes and shakes, so a clean break is the point.

- [ ] **Step 2: Tell `BattleScene` when the fight is the boss**

Add to `BattleSceneData`:

```ts
  /**
   * Passed rather than derived: this scene is playable standalone and has no
   * access to RunState, so the map stays the only thing that knows what a
   * node means.
   */
  boss?: boolean;
```

Declare the field beside the scene's other per-run state:

```ts
  /** True for the map's boss node. Drives the music, nothing else. */
  private isBoss = false;
```

and set it in `init` beside the rest of the rebuilt state, which is where
anything mutable belongs — scene instances outlive their scenes here:

```ts
    this.isBoss = data.boss ?? false;
```

- [ ] **Step 3: Use it in `create`**

Replace `playMusic(this, 'battle')`:

```ts
    if (this.isBoss) {
      playSfx(this, 'warning');
      playMusic(this, 'boss');
    } else {
      playMusic(this, 'battle');
    }
```

- [ ] **Step 4: Pass the flag from the map**

`resolveNode` (`QuestScene.ts:338`) already has the node in hand, and a boss
node's `kind` is literally `'boss'` — so this needs no lookup against
`run.map.bossId`. Add one line to the `this.scene.start('BattleScene', {...})`
call at `:349`:

```ts
          this.scene.start('BattleScene', {
            party: this.run.party,
            foes,
            bag: this.run.bag,
            seed: battleSeed(this.run, node),
            returnTo: 'QuestScene',
            boss: node.kind === 'boss',
          });
```

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Play both**

Run `pnpm dev`. In Dodger, survive to 90 s and confirm the siren fires and the music hands over as the boss descends. In Sigil, walk the map to the boss node and confirm the same handover, then lose or win and re-enter — the siren firing again on a fresh attempt is correct, but confirm it does not stack with the fade-in.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.ts src/scenes/BattleScene.ts src/scenes/QuestScene.ts
git commit -m "Let a boss sound like a boss in both games"
```

---

### Task 9: The all-clear

**Files:**
- Modify: `src/scenes/GameScene.ts:794` (`triggerWin`)
- Modify: `src/scenes/QuestScene.ts:469` (`endRun`)

**Interfaces:**
- Consumes: `'allclear'` (Task 3).

- [ ] **Step 1: Dodger's win**

In `triggerWin`, keep `explode` and replace `milestone`:

```ts
    fadeOutMusic(this);
    playSfx(this, 'explode');
    // Delayed so the fanfare reads as the consequence of the boss coming
    // apart rather than a layer inside it.
    this.time.delayedCall(180, () => playSfx(this, 'allclear'));
```

- [ ] **Step 2: Sigil's win**

In `endRun`:

```ts
    playSfx(this, won ? 'allclear' : 'gameover');
```

Leave the rest of `endRun` alone. It does not fade the quest loop today, and whether it should is a separate decision from this one.

- [ ] **Step 3: Verify**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Play both endings**

Run `pnpm dev`. Beat Dodger's boss: the explosion lands, then the fanfare over the fading music. Finish a Sigil run: the fanfare, not the level-up chime it used to borrow.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts src/scenes/QuestScene.ts
git commit -m "Give winning a sound of its own"
```

---

### Task 10: Measure the boot cost

The spec flags this as the pack's real risk. Every buffer renders at boot in an `OfflineAudioContext`; twelve short effects are cheap, but an 8.14-second music loop is not, and this is the point where it either shows up or is ruled out.

**Files:**
- Modify: `src/audio/bus.ts` — only if the measurement says so.

- [ ] **Step 1: Measure**

Add a temporary `console.time('audio-boot')` / `console.timeEnd('audio-boot')` around the render loop in `initAudio` (`src/audio/bus.ts:39`), run `pnpm dev`, and read the number from the browser console on a cold load. Record it in the commit body.

- [ ] **Step 2: Decide**

Under ~150 ms: remove the timing lines and stop. Rendering stays at boot.

Over that: render music lazily on first `playMusic` instead, which is a change to `bus.ts` alone — effects still render at boot, since those are the ones that must be ready the instant a scene starts. Do not restructure anything outside `bus.ts` for this.

- [ ] **Step 3: Commit**

```bash
git add src/audio/bus.ts
git commit -m "Confirm the sound pack's boot cost"
```

If nothing changed, there is nothing to commit — say so and finish.

---

## Done

At this point: 34 sounds, 8 music loops, one tested mapper, and `gameover` means only what it says. Run `pnpm test` and `pnpm build` once more, then use the `superpowers:finishing-a-development-branch` skill to decide how this lands.
