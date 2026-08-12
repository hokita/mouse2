# Game Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give mouse2 fourteen synthesized sound effects and four looping music beds, with a mute chip whose setting survives a reload.

**Architecture:** A new `src/audio/` module. Two pure, unit-tested files (note maths, mute preference) sit under a Web Audio layer that renders every sound once at boot with `OfflineAudioContext`. The finished `AudioBuffer`s are registered in Phaser's audio cache, so Phaser owns looping, volume, tab-blur pausing and the iOS unlock. Scenes only ever call `playSfx` / `playMusic` / `fadeOutMusic` from `audio/bus.ts`.

**Tech Stack:** TypeScript 5.6 (strict), Phaser 3.80, Vite 5, Vitest 2, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-12-game-audio-design.md`

## Global Constraints

- **No binary assets.** Every sound is synthesized in code. Never add a `.mp3`, `.ogg`, `.wav` or base64 audio blob to the repo.
- **Audio is never load-bearing.** Every public function in `audio/bus.ts` must be a safe no-op when audio is unavailable. No audio failure may throw into a scene.
- **TDD on the pure layer only.** `audio/notes.ts` and `audio/preference.ts` are written test-first. The Web Audio layer (`synth.ts`, `sfx.ts`, `music.ts`, `bus.ts`) has no unit tests — Node has no `OfflineAudioContext`, and no assertion tells you a sound is pleasant. It is verified in the browser.
- **Existing style is the house style.** Match the surrounding code: named exports, no default exports, `PALETTE`/`DEPTH` tokens from `src/ui/theme.ts` and `src/ui/widgets.ts`, and comments that explain *why* rather than *what*.
- **Mix levels:** music `0.35`, effects `0.6` unless the catalog gives a specific volume. Music fade `250 ms`; game-over fade `400 ms`.
- **localStorage key:** exactly `mouse2:muted`, values `'true'` / `'false'`.
- **Which games get the `gameover` sting.** Dodger and Car Racer, whose runs end in a crash. Fish Catch ends on its own `timeup` horn and does **not** also play `gameover` — two endings stacked on one moment is one too many. This resolves the spec's "shared by all three games" phrasing.
- **Every task ends green:** `pnpm test` and `pnpm build` (which runs `tsc --noEmit`) both pass before the commit.
- **Browser verification keeps the Chrome window visible.** A hidden window throttles Phaser to about 1 fps and makes a working game look broken.

---

### Task 1: Note maths

**Files:**
- Create: `src/audio/notes.ts`
- Test: `src/audio/__tests__/notes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Step = string | null`
  - `interface NoteEvent { freq: number; startSec: number; durSec: number }`
  - `noteToFreq(note: string): number`
  - `stepDurationSec(bpm: number, stepsPerBeat: number): number`
  - `sequence(steps: Step[], bpm: number, stepsPerBeat: number, gate?: number): NoteEvent[]`
  - `loopLengthSec(steps: Step[], bpm: number, stepsPerBeat: number): number`

- [ ] **Step 1: Write the failing test**

Create `src/audio/__tests__/notes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loopLengthSec, noteToFreq, sequence, stepDurationSec } from '../notes';

describe('noteToFreq', () => {
  it('puts concert A at 440 Hz', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440, 6);
  });

  it('doubles an octave up and halves an octave down', () => {
    expect(noteToFreq('A5')).toBeCloseTo(880, 6);
    expect(noteToFreq('A3')).toBeCloseTo(220, 6);
  });

  it('reads sharps', () => {
    expect(noteToFreq('A#4')).toBeCloseTo(466.164, 3);
    expect(noteToFreq('C4')).toBeCloseTo(261.626, 3);
  });

  it('handles a two-digit octave and a negative one', () => {
    expect(noteToFreq('C0')).toBeCloseTo(16.352, 3);
  });

  it('rejects a note name it cannot parse', () => {
    expect(() => noteToFreq('H4')).toThrow();
    expect(() => noteToFreq('A')).toThrow();
  });
});

describe('stepDurationSec', () => {
  it('splits a beat into steps', () => {
    // 120 bpm is a half-second beat; two steps per beat is a quarter second.
    expect(stepDurationSec(120, 2)).toBeCloseTo(0.25, 6);
    expect(stepDurationSec(100, 4)).toBeCloseTo(0.15, 6);
  });
});

describe('sequence', () => {
  it('places one event per step, in order', () => {
    const events = sequence(['A4', 'A5'], 120, 2);
    expect(events).toHaveLength(2);
    expect(events[0].startSec).toBeCloseTo(0, 6);
    expect(events[1].startSec).toBeCloseTo(0.25, 6);
    expect(events[1].freq).toBeCloseTo(880, 6);
  });

  it('skips rests but keeps the timing of everything after them', () => {
    const events = sequence(['A4', null, 'A4'], 120, 2);
    expect(events).toHaveLength(2);
    expect(events[1].startSec).toBeCloseTo(0.5, 6);
  });

  it('shortens each note by the gate so neighbours never overlap', () => {
    const events = sequence(['A4', 'A4'], 120, 2, 0.8);
    expect(events[0].durSec).toBeCloseTo(0.2, 6);
    expect(events[0].startSec + events[0].durSec).toBeLessThanOrEqual(events[1].startSec);
  });

  it('returns nothing for an empty pattern or one that is all rests', () => {
    expect(sequence([], 120, 2)).toEqual([]);
    expect(sequence([null, null], 120, 2)).toEqual([]);
  });
});

describe('loopLengthSec', () => {
  it('measures the whole pattern, rests included', () => {
    // 32 steps at 120 bpm, two steps to the beat: 32 * 0.25 = 8 seconds.
    expect(loopLengthSec(new Array(32).fill(null), 120, 2)).toBeCloseTo(8, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/audio/__tests__/notes.test.ts`
Expected: FAIL — `Failed to resolve import "../notes"`.

- [ ] **Step 3: Write the implementation**

Create `src/audio/notes.ts`:

```ts
// The music side of the audio module is written as note names and step
// patterns rather than raw frequencies and timestamps: a pattern you can read
// is a pattern you can edit. Everything here is pure, so it is also the part
// of the audio system that unit tests can actually reach.

/** One slot in a pattern: a note name like 'A4', or null for a rest. */
export type Step = string | null;

export interface NoteEvent {
  freq: number;
  /** Seconds from the start of the pattern. */
  startSec: number;
  durSec: number;
}

const SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

const NOTE_PATTERN = /^([A-G]#?)(-?\d+)$/;

/** 'A4' → 440. Equal temperament, MIDI note 69 as the anchor. */
export function noteToFreq(note: string): number {
  const match = NOTE_PATTERN.exec(note);
  if (match === null) {
    throw new Error(`Unreadable note name: ${note}`);
  }
  const semitone = SEMITONES[match[1]];
  const octave = Number(match[2]);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function stepDurationSec(bpm: number, stepsPerBeat: number): number {
  return 60 / bpm / stepsPerBeat;
}

/**
 * Turns a pattern into timed events. `gate` is the fraction of its slot a note
 * actually sounds for — anything under 1 leaves a gap, which is what keeps
 * consecutive notes from smearing into one held tone.
 */
export function sequence(
  steps: Step[],
  bpm: number,
  stepsPerBeat: number,
  gate = 0.9
): NoteEvent[] {
  const step = stepDurationSec(bpm, stepsPerBeat);
  const events: NoteEvent[] = [];
  steps.forEach((note, index) => {
    if (note === null) {
      return;
    }
    events.push({
      freq: noteToFreq(note),
      startSec: index * step,
      durSec: step * gate,
    });
  });
  return events;
}

/** The full pattern length, counting trailing rests — this is the loop point. */
export function loopLengthSec(steps: Step[], bpm: number, stepsPerBeat: number): number {
  return steps.length * stepDurationSec(bpm, stepsPerBeat);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/audio/__tests__/notes.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio/notes.ts src/audio/__tests__/notes.test.ts
git commit -m "feat(audio): note names and step patterns to timed events"
```

---

### Task 2: Mute preference

**Files:**
- Create: `src/audio/preference.ts`
- Test: `src/audio/__tests__/preference.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface MuteStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }`
  - `const MUTE_KEY = 'mouse2:muted'`
  - `readMuted(storage: MuteStorage | null): boolean`
  - `writeMuted(storage: MuteStorage | null, muted: boolean): void`

- [ ] **Step 1: Write the failing test**

Create `src/audio/__tests__/preference.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { MUTE_KEY, readMuted, writeMuted } from '../preference';
import type { MuteStorage } from '../preference';

function stub(value: string | null): MuteStorage {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
  };
}

const throwing: MuteStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('SecurityError');
  },
};

describe('readMuted', () => {
  it('reads a stored true', () => {
    expect(readMuted(stub('true'))).toBe(true);
  });

  it('reads a stored false', () => {
    expect(readMuted(stub('false'))).toBe(false);
  });

  it('defaults to unmuted when nothing is stored', () => {
    expect(readMuted(stub(null))).toBe(false);
  });

  it('defaults to unmuted on a value it does not recognise', () => {
    expect(readMuted(stub('yes'))).toBe(false);
  });

  it('defaults to unmuted when there is no storage at all', () => {
    expect(readMuted(null)).toBe(false);
  });

  it('defaults to unmuted when the storage throws', () => {
    // Private-mode Safari throws on access. That should cost the preference,
    // not the game.
    expect(readMuted(throwing)).toBe(false);
  });

  it('reads the agreed key', () => {
    const storage = stub('true');
    readMuted(storage);
    expect(storage.getItem).toHaveBeenCalledWith('mouse2:muted');
    expect(MUTE_KEY).toBe('mouse2:muted');
  });
});

describe('writeMuted', () => {
  it('stores the flag as a string', () => {
    const storage = stub(null);
    writeMuted(storage, true);
    expect(storage.setItem).toHaveBeenCalledWith('mouse2:muted', 'true');
    writeMuted(storage, false);
    expect(storage.setItem).toHaveBeenCalledWith('mouse2:muted', 'false');
  });

  it('says nothing when there is no storage', () => {
    expect(() => writeMuted(null, true)).not.toThrow();
  });

  it('swallows a storage that throws', () => {
    expect(() => writeMuted(throwing, true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/audio/__tests__/preference.test.ts`
Expected: FAIL — `Failed to resolve import "../preference"`.

- [ ] **Step 3: Write the implementation**

Create `src/audio/preference.ts`:

```ts
// The mute flag is the only thing the game remembers between visits, and it is
// deliberately the least important thing in the project: every path through
// here degrades to "unmuted" rather than throwing. Storage is injected so the
// rules above are testable without a browser.

export interface MuteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MUTE_KEY = 'mouse2:muted';

export function readMuted(storage: MuteStorage | null): boolean {
  if (storage === null) {
    return false;
  }
  try {
    return storage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeMuted(storage: MuteStorage | null, muted: boolean): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(MUTE_KEY, muted ? 'true' : 'false');
  } catch {
    // Nothing to do and nothing worth telling the player about.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/audio/__tests__/preference.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio/preference.ts src/audio/__tests__/preference.test.ts
git commit -m "feat(audio): persist the mute flag, failing soft on hostile storage"
```

---

### Task 3: Synth primitives

**Files:**
- Create: `src/audio/synth.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ToneOptions { type: OscillatorType; freq: number; endFreq?: number; start: number; duration: number; gain: number; attack?: number }`
  - `interface NoiseOptions { start: number; duration: number; gain: number; filterStart?: number; filterEnd?: number }`
  - `tone(ctx: BaseAudioContext, dest: AudioNode, opts: ToneOptions): void`
  - `noise(ctx: BaseAudioContext, dest: AudioNode, opts: NoiseOptions): void`
  - `renderBuffer(sampleRate: number, durationSec: number, draw: (ctx: BaseAudioContext, dest: AudioNode) => void): Promise<AudioBuffer>`

No unit tests — see Global Constraints. This task is verified by `tsc`.

- [ ] **Step 1: Write the implementation**

Create `src/audio/synth.ts`:

```ts
// Two voices — a shaped oscillator and a filtered noise burst — are enough to
// build every sound in the game, the same way a handful of draw calls build
// every sprite in ui/textures.ts.
//
// Everything takes an explicit `start` time in context seconds and writes into
// a BaseAudioContext, so the same code renders into an OfflineAudioContext at
// boot without knowing it is not playing live.

export interface ToneOptions {
  type: OscillatorType;
  freq: number;
  /** Sweeps from `freq` to here across the note when given. */
  endFreq?: number;
  start: number;
  duration: number;
  gain: number;
  /** Fraction of the note spent ramping up. Small is percussive. */
  attack?: number;
}

/**
 * Gain never ramps to or from a true zero: exponentialRampToValueAtTime is
 * undefined at 0, and a linear ramp on a decaying note clicks. A near-silent
 * floor is the standard dodge.
 */
const SILENCE = 0.0001;

export function tone(ctx: BaseAudioContext, dest: AudioNode, opts: ToneOptions): void {
  const { type, freq, endFreq, start, duration, gain, attack = 0.08 } = opts;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENCE, start);
  env.gain.exponentialRampToValueAtTime(Math.max(SILENCE, gain), start + duration * attack);
  env.gain.exponentialRampToValueAtTime(SILENCE, start + duration);

  osc.connect(env).connect(dest);
  osc.start(start);
  // A hair of tail past the envelope, so the stop itself is never the click.
  osc.stop(start + duration + 0.01);
}

export interface NoiseOptions {
  start: number;
  duration: number;
  gain: number;
  /** Low-pass cutoff at the top of the burst and at its end. */
  filterStart?: number;
  filterEnd?: number;
}

export function noise(ctx: BaseAudioContext, dest: AudioNode, opts: NoiseOptions): void {
  const { start, duration, gain, filterStart = 4000, filterEnd = 300 } = opts;

  const frames = Math.max(1, Math.ceil(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // A cutoff falling across the burst is what turns white noise into an
  // explosion rather than a hiss: the bright edge arrives first and the body
  // darkens as it decays.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterStart, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), start + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(Math.max(SILENCE, gain), start);
  env.gain.exponentialRampToValueAtTime(SILENCE, start + duration);

  src.connect(filter).connect(env).connect(dest);
  src.start(start);
  src.stop(start + duration);
}

/**
 * Renders one sound to a buffer. OfflineAudioContext needs no user gesture and
 * renders far faster than real time, so every sound in the game can be built
 * at boot and then played like any loaded file.
 */
export async function renderBuffer(
  sampleRate: number,
  durationSec: number,
  draw: (ctx: BaseAudioContext, dest: AudioNode) => void
): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(durationSec * sampleRate));
  const ctx = new OfflineAudioContext(1, frames, sampleRate);
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  draw(ctx, master);
  return ctx.startRendering();
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: PASS — `tsc --noEmit` clean, Vite build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/audio/synth.ts
git commit -m "feat(audio): oscillator and noise voices, rendered offline"
```

---

### Task 4: The effect catalog

**Files:**
- Create: `src/audio/sfx.ts`

**Interfaces:**
- Consumes: `noteToFreq` from `audio/notes.ts`; `tone`, `noise` from `audio/synth.ts`.
- Produces:
  - `type SfxName = 'tap' | 'launch' | 'gameover' | 'shoot' | 'explode' | 'hurt' | 'crash' | 'milestone' | 'catch' | 'rare' | 'trash' | 'plop' | 'levelup' | 'timeup'`
  - `interface SfxSpec { durationSec: number; volume: number; render(ctx: BaseAudioContext, dest: AudioNode): void }`
  - `const SFX: Record<SfxName, SfxSpec>`

No unit tests. Verified by `tsc` here and by ear in Task 6 onward.

- [ ] **Step 1: Write the implementation**

Create `src/audio/sfx.ts`:

```ts
import { noteToFreq } from './notes';
import { noise, tone } from './synth';

// The whole vocabulary of the game in fourteen sounds. Each one is a handful
// of voices over a fixed span; `durationSec` must cover the last voice's tail
// or the render truncates it.
//
// `volume` is the playback level, not the render level. It is per-effect
// because these are not equals: a game-over sting wants the room, and the
// Dodger auto-fire tick wants to disappear into it.

export type SfxName =
  | 'tap'
  | 'launch'
  | 'gameover'
  | 'shoot'
  | 'explode'
  | 'hurt'
  | 'crash'
  | 'milestone'
  | 'catch'
  | 'rare'
  | 'trash'
  | 'plop'
  | 'levelup'
  | 'timeup';

export interface SfxSpec {
  durationSec: number;
  volume: number;
  render(ctx: BaseAudioContext, dest: AudioNode): void;
}

export const SFX: Record<SfxName, SfxSpec> = {
  // --- shared UI ---------------------------------------------------------

  tap: {
    durationSec: 0.12,
    volume: 0.45,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'square',
        freq: noteToFreq('E5'),
        start: 0,
        duration: 0.07,
        gain: 0.5,
        attack: 0.05,
      });
    },
  },

  launch: {
    durationSec: 0.34,
    volume: 0.5,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A3'),
        endFreq: noteToFreq('A5'),
        start: 0,
        duration: 0.28,
        gain: 0.5,
        attack: 0.12,
      });
      noise(ctx, dest, {
        start: 0,
        duration: 0.28,
        gain: 0.07,
        filterStart: 900,
        filterEnd: 6000,
      });
    },
  },

  gameover: {
    durationSec: 0.9,
    volume: 0.6,
    render(ctx, dest) {
      // Three steps down. The last one is held longest so the run reads as
      // over rather than interrupted.
      const notes: Array<[string, number, number]> = [
        ['G4', 0, 0.18],
        ['E4', 0.18, 0.18],
        ['A3', 0.36, 0.5],
      ];
      for (const [note, start, duration] of notes) {
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq(note),
          start,
          duration,
          gain: 0.45,
          attack: 0.06,
        });
        tone(ctx, dest, {
          type: 'triangle',
          freq: noteToFreq(note) / 2,
          start,
          duration,
          gain: 0.3,
          attack: 0.06,
        });
      }
    },
  },

  // --- Dodger ------------------------------------------------------------

  shoot: {
    durationSec: 0.06,
    // The ship fires on a timer. Anything meatier than this becomes a machine
    // gun within five seconds.
    volume: 0.15,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'square',
        freq: noteToFreq('B5'),
        endFreq: noteToFreq('E5'),
        start: 0,
        duration: 0.04,
        gain: 0.4,
        attack: 0.04,
      });
    },
  },

  explode: {
    durationSec: 0.36,
    volume: 0.5,
    render(ctx, dest) {
      noise(ctx, dest, {
        start: 0,
        duration: 0.3,
        gain: 0.6,
        filterStart: 5200,
        filterEnd: 220,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: 220,
        endFreq: 60,
        start: 0,
        duration: 0.24,
        gain: 0.35,
        attack: 0.03,
      });
    },
  },

  hurt: {
    durationSec: 0.34,
    volume: 0.55,
    render(ctx, dest) {
      // Two saws a few cents apart: the beating between them is the "wrong"
      // in the sound, and it costs nothing to make.
      tone(ctx, dest, {
        type: 'sawtooth',
        freq: 148,
        endFreq: 96,
        start: 0,
        duration: 0.28,
        gain: 0.32,
        attack: 0.04,
      });
      tone(ctx, dest, {
        type: 'sawtooth',
        freq: 155,
        endFreq: 99,
        start: 0,
        duration: 0.28,
        gain: 0.32,
        attack: 0.04,
      });
    },
  },

  // --- Car Racer ---------------------------------------------------------

  crash: {
    durationSec: 0.6,
    volume: 0.6,
    render(ctx, dest) {
      noise(ctx, dest, {
        start: 0,
        duration: 0.5,
        gain: 0.75,
        filterStart: 3400,
        filterEnd: 120,
      });
      tone(ctx, dest, {
        type: 'sine',
        freq: 160,
        endFreq: 42,
        start: 0,
        duration: 0.42,
        gain: 0.6,
        attack: 0.02,
      });
      // A second, smaller impact: wreckage settling.
      noise(ctx, dest, {
        start: 0.16,
        duration: 0.24,
        gain: 0.3,
        filterStart: 2600,
        filterEnd: 300,
      });
    },
  },

  milestone: {
    durationSec: 0.34,
    volume: 0.4,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('D5'),
        start: 0,
        duration: 0.12,
        gain: 0.4,
        attack: 0.06,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A5'),
        start: 0.1,
        duration: 0.2,
        gain: 0.4,
        attack: 0.06,
      });
    },
  },

  // --- Fish Catch --------------------------------------------------------

  catch: {
    durationSec: 0.22,
    volume: 0.5,
    render(ctx, dest) {
      // Played with a rising detune through a streak — see FishScene.
      tone(ctx, dest, {
        type: 'square',
        freq: noteToFreq('D5'),
        endFreq: noteToFreq('A5'),
        start: 0,
        duration: 0.14,
        gain: 0.42,
        attack: 0.08,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('D6'),
        start: 0.06,
        duration: 0.1,
        gain: 0.2,
        attack: 0.1,
      });
    },
  },

  rare: {
    durationSec: 0.5,
    volume: 0.55,
    render(ctx, dest) {
      const notes = ['D5', 'F#5', 'A5', 'D6'];
      notes.forEach((note, index) => {
        tone(ctx, dest, {
          type: 'triangle',
          freq: noteToFreq(note),
          start: index * 0.06,
          duration: 0.22,
          gain: 0.34,
          attack: 0.08,
        });
      });
    },
  },

  trash: {
    durationSec: 0.3,
    volume: 0.55,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'square',
        freq: 190,
        endFreq: 70,
        start: 0,
        duration: 0.22,
        gain: 0.4,
        attack: 0.04,
      });
      noise(ctx, dest, {
        start: 0,
        duration: 0.14,
        gain: 0.25,
        filterStart: 1600,
        filterEnd: 200,
      });
    },
  },

  plop: {
    durationSec: 0.2,
    volume: 0.35,
    render(ctx, dest) {
      // A water drop is a fast upward blip in a sine, not a downward one —
      // the pitch rises as the cavity closes.
      tone(ctx, dest, {
        type: 'sine',
        freq: 420,
        endFreq: 900,
        start: 0,
        duration: 0.09,
        gain: 0.4,
        attack: 0.15,
      });
    },
  },

  levelup: {
    durationSec: 0.5,
    volume: 0.5,
    render(ctx, dest) {
      const notes = ['A4', 'C#5', 'E5'];
      notes.forEach((note, index) => {
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq(note),
          start: index * 0.09,
          duration: 0.2,
          gain: 0.38,
          attack: 0.07,
        });
      });
    },
  },

  timeup: {
    durationSec: 0.95,
    volume: 0.6,
    render(ctx, dest) {
      // A horn: two stacked saws holding, then falling away together.
      for (const freq of [noteToFreq('D4'), noteToFreq('A4')]) {
        tone(ctx, dest, {
          type: 'sawtooth',
          freq,
          start: 0,
          duration: 0.55,
          gain: 0.3,
          attack: 0.1,
        });
        tone(ctx, dest, {
          type: 'sawtooth',
          freq,
          endFreq: freq * 0.75,
          start: 0.5,
          duration: 0.4,
          gain: 0.25,
          attack: 0.1,
        });
      }
    },
  },
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/audio/sfx.ts
git commit -m "feat(audio): the fourteen-effect catalog"
```

---

### Task 5: Music loops

**Files:**
- Create: `src/audio/music.ts`

**Interfaces:**
- Consumes: `Step`, `sequence`, `loopLengthSec`, `stepDurationSec` from `audio/notes.ts`; `tone`, `noise` from `audio/synth.ts`.
- Produces:
  - `type MusicName = 'menu' | 'dodger' | 'car' | 'fish'`
  - `type Drum = 'kick' | 'hat' | null`
  - `interface MusicSpec { bpm: number; leadType: OscillatorType; leadGain: number; bass: Step[]; lead: Step[]; drums: Drum[] }`
  - `const MUSIC: Record<MusicName, MusicSpec>`
  - `musicLengthSec(spec: MusicSpec): number`
  - `renderMusic(spec: MusicSpec, ctx: BaseAudioContext, dest: AudioNode): void`

No unit tests. Verified by `tsc` here and by ear in Task 6.

- [ ] **Step 1: Write the implementation**

Create `src/audio/music.ts`:

```ts
import { loopLengthSec, sequence, stepDurationSec } from './notes';
import type { Step } from './notes';
import { noise, tone } from './synth';

// Four loops, three tracks each: a bass, a lead and a drum row. Every track is
// 32 steps of an eighth note, which at 100–120 bpm is a loop of eight to ten
// seconds — long enough not to nag, short enough to render at boot.
//
// All three arrays in a spec MUST be 32 entries. The loop point comes from the
// lead, so a short bass array would silently truncate the loop.

export type MusicName = 'menu' | 'dodger' | 'car' | 'fish';
export type Drum = 'kick' | 'hat' | null;

export interface MusicSpec {
  bpm: number;
  leadType: OscillatorType;
  leadGain: number;
  bass: Step[];
  lead: Step[];
  drums: Drum[];
}

const STEPS_PER_BEAT = 2;

const _ = null;
const k: Drum = 'kick';
const h: Drum = 'hat';

export const MUSIC: Record<MusicName, MusicSpec> = {
  // Calm, unhurried, and quiet enough to sit under a decision.
  menu: {
    bpm: 100,
    leadType: 'triangle',
    leadGain: 0.16,
    bass: [
      'D2', _, _, _, _, _, _, _,
      'A2', _, _, _, _, _, _, _,
      'B2', _, _, _, _, _, _, _,
      'G2', _, _, _, _, _, _, _,
    ],
    lead: [
      'D4', _, 'F#4', _, 'A4', _, 'F#4', _,
      'E4', _, 'A4', _, 'C#5', _, 'A4', _,
      'D5', _, 'B4', _, 'F#4', _, 'B4', _,
      'G4', _, 'B4', _, 'D5', _, 'B4', _,
    ],
    drums: [
      k, _, _, _, h, _, _, _,
      k, _, _, _, h, _, _, _,
      k, _, _, _, h, _, _, _,
      k, _, _, _, h, _, h, _,
    ],
  },

  // Driving: a walking bass and a busy arpeggio, minor and forward-leaning.
  dodger: {
    bpm: 120,
    leadType: 'square',
    leadGain: 0.13,
    bass: [
      'A1', _, 'A1', _, 'A1', _, 'G1', _,
      'A1', _, 'A1', _, 'C2', _, 'B1', _,
      'A1', _, 'A1', _, 'A1', _, 'G1', _,
      'F1', _, 'F1', _, 'E1', _, 'E1', _,
    ],
    lead: [
      'A4', 'C5', 'E5', 'C5', 'A4', 'C5', 'E5', 'G5',
      'A4', 'C5', 'E5', 'C5', 'B4', 'D5', 'F#5', 'D5',
      'A4', 'C5', 'E5', 'C5', 'A4', 'C5', 'E5', 'G5',
      'F4', 'A4', 'C5', 'A4', 'E4', 'G#4', 'B4', 'E5',
    ],
    drums: [
      k, h, _, h, k, h, _, h,
      k, h, _, h, k, h, h, h,
      k, h, _, h, k, h, _, h,
      k, h, _, h, k, h, k, h,
    ],
  },

  // A night drive: a steady pulse on the beat, the lead sparse above it.
  car: {
    bpm: 112,
    leadType: 'sawtooth',
    leadGain: 0.1,
    bass: [
      'E2', _, 'E2', _, 'E2', _, 'E2', _,
      'E2', _, 'E2', _, 'D2', _, 'D2', _,
      'C2', _, 'C2', _, 'C2', _, 'C2', _,
      'B1', _, 'B1', _, 'B1', _, 'B1', _,
    ],
    lead: [
      'B4', _, _, 'E5', _, _, 'B4', _,
      _, 'G4', _, _, 'B4', _, _, _,
      'C5', _, _, 'G4', _, _, 'E5', _,
      _, 'D5', _, _, 'B4', _, _, _,
    ],
    drums: [
      k, _, h, _, k, _, h, _,
      k, _, h, _, k, _, h, h,
      k, _, h, _, k, _, h, _,
      k, _, h, _, k, _, h, h,
    ],
  },

  // Sparse and watery: long bass notes, a melody with room between the notes,
  // and almost no percussion.
  fish: {
    bpm: 104,
    leadType: 'triangle',
    leadGain: 0.18,
    bass: [
      'G2', _, _, _, _, _, _, _,
      'C3', _, _, _, _, _, _, _,
      'E2', _, _, _, _, _, _, _,
      'A2', _, _, _, _, _, _, _,
    ],
    lead: [
      'G4', _, _, 'B4', _, 'D5', _, _,
      'E5', _, _, 'D5', _, _, 'B4', _,
      'G4', _, 'B4', _, _, 'E5', _, _,
      'D5', _, _, 'B4', _, 'G4', _, _,
    ],
    drums: [
      k, _, _, _, _, _, _, _,
      _, _, _, _, h, _, _, _,
      k, _, _, _, _, _, _, _,
      _, _, _, _, h, _, _, _,
    ],
  },
};

export function musicLengthSec(spec: MusicSpec): number {
  return loopLengthSec(spec.lead, spec.bpm, STEPS_PER_BEAT);
}

export function renderMusic(spec: MusicSpec, ctx: BaseAudioContext, dest: AudioNode): void {
  // A long gate on the bass makes it read as one held line under the lead;
  // a short one on the lead keeps the arpeggio articulated.
  for (const event of sequence(spec.bass, spec.bpm, STEPS_PER_BEAT, 0.95)) {
    tone(ctx, dest, {
      type: 'triangle',
      freq: event.freq,
      start: event.startSec,
      duration: event.durSec,
      gain: 0.22,
      attack: 0.05,
    });
  }

  for (const event of sequence(spec.lead, spec.bpm, STEPS_PER_BEAT, 0.75)) {
    tone(ctx, dest, {
      type: spec.leadType,
      freq: event.freq,
      start: event.startSec,
      duration: event.durSec,
      gain: spec.leadGain,
      attack: 0.07,
    });
  }

  const step = stepDurationSec(spec.bpm, STEPS_PER_BEAT);
  spec.drums.forEach((drum, index) => {
    if (drum === null) {
      return;
    }
    const start = index * step;
    if (drum === 'kick') {
      tone(ctx, dest, {
        type: 'sine',
        freq: 140,
        endFreq: 46,
        start,
        duration: 0.16,
        gain: 0.3,
        attack: 0.02,
      });
    } else {
      noise(ctx, dest, {
        start,
        duration: 0.045,
        gain: 0.06,
        filterStart: 9000,
        filterEnd: 5200,
      });
    }
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/audio/music.ts
git commit -m "feat(audio): four chiptune loops, one per screen"
```

---

### Task 6: The bus, and the first audible sound

The first task that makes noise. It wires `initAudio` into boot and gives the menu its tap, launch and music.

**Files:**
- Create: `src/audio/bus.ts`
- Modify: `src/main.ts` (add the `initAudio` call after the game is constructed)
- Modify: `src/scenes/MenuScene.ts` (`create()` around line 39; the card `pointerdown` handler around line 175)

**Interfaces:**
- Consumes: `SFX`/`SfxName` (Task 4), `MUSIC`/`MusicName`/`musicLengthSec`/`renderMusic` (Task 5), `renderBuffer` (Task 3), `readMuted`/`writeMuted` (Task 2).
- Produces:
  - `initAudio(game: Phaser.Game): void`
  - `playSfx(scene: Phaser.Scene, name: SfxName, config?: { detune?: number }): void`
  - `playMusic(scene: Phaser.Scene, name: MusicName): void`
  - `fadeOutMusic(scene: Phaser.Scene, durationMs?: number): void`
  - `isMuted(): boolean`
  - `setMuted(muted: boolean): void`
  - `onMuteChange(listener: (muted: boolean) => void): () => void`

- [ ] **Step 1: Write the bus**

Create `src/audio/bus.ts`:

```ts
import Phaser from 'phaser';
import { MUSIC, musicLengthSec, renderMusic } from './music';
import type { MusicName } from './music';
import { readMuted, writeMuted } from './preference';
import type { MuteStorage } from './preference';
import { SFX } from './sfx';
import type { SfxName } from './sfx';
import { renderBuffer } from './synth';

// The only part of the audio system a scene ever sees. Two rules hold
// everywhere in this file: nothing here throws into a scene, and every entry
// point is a no-op when audio is unavailable.

const MUSIC_VOLUME = 0.35;
const MUSIC_FADE_MS = 250;
const GAME_OVER_FADE_MS = 400;

let game: Phaser.Game | null = null;
/** False until buffers are rendering: no WebAudio, no sound, no complaints. */
let enabled = false;
let muted = false;

const listeners = new Set<(muted: boolean) => void>();
let current: { name: MusicName; sound: Phaser.Sound.BaseSound } | null = null;

function storage(): MuteStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function initAudio(target: Phaser.Game): void {
  game = target;

  // Read the preference before the capability check: even with no audio to
  // mute, the chip should show what the player last chose.
  muted = readMuted(storage());
  target.sound.mute = muted;

  if (
    !(target.sound instanceof Phaser.Sound.WebAudioSoundManager) ||
    typeof OfflineAudioContext === 'undefined'
  ) {
    return;
  }

  enabled = true;
  void renderAll(target, target.sound.context.sampleRate);
}

async function renderAll(target: Phaser.Game, sampleRate: number): Promise<void> {
  // Rendered one at a time and each in its own try: a single bad sound costs
  // that sound, not the soundtrack.
  for (const [name, spec] of Object.entries(SFX)) {
    try {
      const buffer = await renderBuffer(sampleRate, spec.durationSec, spec.render);
      target.cache.audio.add(`sfx-${name}`, buffer);
    } catch (error) {
      console.warn(`[audio] could not render sfx "${name}"`, error);
    }
  }

  for (const [name, spec] of Object.entries(MUSIC)) {
    try {
      const buffer = await renderBuffer(sampleRate, musicLengthSec(spec), (ctx, dest) =>
        renderMusic(spec, ctx, dest)
      );
      target.cache.audio.add(`music-${name}`, buffer);
    } catch (error) {
      console.warn(`[audio] could not render music "${name}"`, error);
    }
  }
}

function ready(key: string): boolean {
  return enabled && game !== null && game.cache.audio.exists(key);
}

export function playSfx(
  scene: Phaser.Scene,
  name: SfxName,
  config: { detune?: number } = {}
): void {
  const key = `sfx-${name}`;
  if (!ready(key)) {
    return;
  }
  scene.sound.play(key, { volume: SFX[name].volume, detune: config.detune ?? 0 });
}

export function playMusic(scene: Phaser.Scene, name: MusicName): void {
  const key = `music-${name}`;
  if (!ready(key)) {
    return;
  }
  if (current !== null && current.name === name && current.sound.isPlaying) {
    return;
  }

  // The outgoing loop is cut rather than faded. A fade would be owned by the
  // tween manager of a scene that is already shutting down, which is how a
  // loop survives a scene change and plays over the next one.
  stopMusicNow();

  const sound = scene.sound.add(key, { loop: true, volume: 0 });
  sound.play();
  scene.tweens.add({ targets: sound, volume: MUSIC_VOLUME, duration: MUSIC_FADE_MS });
  current = { name, sound };
}

/** Fades the loop out and forgets it, so a later playMusic starts it again. */
export function fadeOutMusic(scene: Phaser.Scene, durationMs: number = GAME_OVER_FADE_MS): void {
  if (current === null) {
    return;
  }
  const { sound } = current;
  current = null;

  scene.tweens.add({
    targets: sound,
    volume: 0,
    duration: durationMs,
    onComplete: () => {
      sound.stop();
      sound.destroy();
    },
  });
  // A scene change mid-fade would strand the sound at whatever volume the
  // tween had reached, still looping.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (sound.isPlaying) {
      sound.stop();
    }
    sound.destroy();
  });
}

function stopMusicNow(): void {
  if (current === null) {
    return;
  }
  current.sound.stop();
  current.sound.destroy();
  current = null;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (game !== null) {
    game.sound.mute = next;
  }
  writeMuted(storage(), next);
  for (const listener of listeners) {
    listener(next);
  }
}

/** Subscribes to mute changes; returns the unsubscribe. */
export function onMuteChange(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

- [ ] **Step 2: Wire it into boot**

In `src/main.ts`, add the import beside the others and replace the final line.

```ts
import { initAudio } from './audio/bus';
```

```ts
// Buffers render off an OfflineAudioContext, which needs no user gesture — so
// every sound is ready long before the first tap unlocks playback.
const game = new Phaser.Game(config);
initAudio(game);
```

- [ ] **Step 3: Give the menu its sound**

In `src/scenes/MenuScene.ts`, add the import:

```ts
import { playMusic, playSfx } from '../audio/bus';
```

At the end of `create()` (after `this.cameras.main.fadeIn(...)` and the card loop, alongside the other setup), start the loop:

```ts
    playMusic(this, 'menu');
```

In the card `pointerdown` handler, immediately after `this.launching = true;`:

```ts
      playSfx(this, 'tap');
      playSfx(this, 'launch');
```

- [ ] **Step 4: Verify in the browser**

```bash
pnpm dev
```

Open the printed URL in a **visible** Chrome window and check:
1. The menu is silent until the first click anywhere (browser autoplay policy), then the menu loop starts and repeats seamlessly.
2. Clicking a card plays a blip and a rising sweep, and the game starts.
3. The console shows no `[audio]` warnings.

Stop the dev server when done.

- [ ] **Step 5: Verify tests and types**

Run: `pnpm test && pnpm build`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add src/audio/bus.ts src/main.ts src/scenes/MenuScene.ts
git commit -m "feat(audio): render at boot, play from Phaser's cache, sound the menu"
```

---

### Task 7: The mute chip

**Files:**
- Modify: `src/ui/widgets.ts` (add `createSoundButton` after `createBackButton`, which ends around line 345)
- Modify: `src/scenes/MenuScene.ts` (`create()`)

**Interfaces:**
- Consumes: `isMuted`, `setMuted`, `onMuteChange`, `playSfx` from `audio/bus.ts`.
- Produces: `createSoundButton(scene: Phaser.Scene, options?: SoundButtonOptions): Phaser.GameObjects.Container` with `interface SoundButtonOptions { accent?: number; x?: number; y?: number }`.

- [ ] **Step 1: Add the widget**

In `src/ui/widgets.ts`, add to the existing imports:

```ts
import { isMuted, onMuteChange, playSfx, setMuted } from '../audio/bus';
```

Then add, after `createBackButton`:

```ts
const SOUND_RADIUS = 21;
/** Directly under the back chip: the top row is already three items wide. */
const SOUND_Y = BACK_Y + 52;

export interface SoundButtonOptions {
  accent?: number;
  x?: number;
  y?: number;
}

/**
 * The mute toggle. Round rather than a pill so it never reads as a second
 * back button, and drawn rather than typed: a speaker emoji renders
 * differently on every platform and arrives as a hollow box on some.
 */
export function createSoundButton(
  scene: Phaser.Scene,
  options: SoundButtonOptions = {}
): Phaser.GameObjects.Container {
  const { accent = PALETTE.text, x = WIDTH / 2, y = SOUND_Y } = options;

  const container = scene.add.container(x, y).setDepth(DEPTH.hud);
  const bg = scene.add.graphics();
  const glyph = scene.add.graphics();

  const paint = (pressed = false): void => {
    const on = !isMuted();

    bg.clear();
    bg.fillStyle(pressed ? PALETTE.surface : PALETTE.skyTop, pressed ? 1 : 0.55);
    bg.fillCircle(0, 0, SOUND_RADIUS);
    bg.lineStyle(1.5, accent, on ? 0.55 : 0.28);
    bg.strokeCircle(0, 0, SOUND_RADIUS);

    glyph.clear();
    const alpha = on ? 0.95 : 0.4;
    glyph.fillStyle(accent, alpha);
    // Neck, then the cone flaring to the right.
    glyph.fillRect(-9, -3.5, 5, 7);
    glyph.fillTriangle(-4, 0, 1, -8, 1, 8);

    if (on) {
      // Two arcs radiating off the cone.
      glyph.lineStyle(1.6, accent, 0.9);
      glyph.beginPath();
      glyph.arc(1, 0, 6, -0.85, 0.85);
      glyph.strokePath();
      glyph.beginPath();
      glyph.arc(1, 0, 10, -0.85, 0.85);
      glyph.strokePath();
    } else {
      glyph.lineStyle(2, accent, 0.75);
      glyph.beginPath();
      glyph.moveTo(-2, -9);
      glyph.lineTo(11, 8);
      glyph.strokePath();
    }
  };
  paint();

  container.add([bg, glyph]);
  container.setSize(SOUND_RADIUS * 2, SOUND_RADIUS * 2);
  container.setInteractive(hitAreaFor(SOUND_RADIUS * 2, SOUND_RADIUS * 2));

  let holding = false;

  container.on(
    'pointerdown',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      // Same guard as the back chip: without it the press also reaches the
      // scene-wide handler and reads as a steer.
      event.stopPropagation();
      holding = true;
      paint(true);
    }
  );

  container.on(
    'pointerup',
    (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData
    ) => {
      if (!holding) {
        return;
      }
      event.stopPropagation();
      holding = false;
      setMuted(!isMuted());
      paint(false);
      // Unmuting should prove itself; muting has nothing to say.
      if (!isMuted()) {
        playSfx(scene, 'tap');
      }
    }
  );

  container.on('pointerout', () => {
    holding = false;
    paint(false);
  });

  // Every screen's chip tracks the same flag, so one going stale behind a
  // scene change would be a lie the next visit inherits.
  const unsubscribe = onMuteChange(() => paint(false));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

  return container;
}
```

- [ ] **Step 2: Put it on the menu**

In `src/scenes/MenuScene.ts`, extend the widgets import to include `createSoundButton`, then add to `create()` beside the `playMusic` call:

```ts
    // The menu has no stat pills, so the chip takes the free top-right corner.
    createSoundButton(this, { accent: PALETTE.cyan, x: WIDTH - 34, y: 40 });
```

- [ ] **Step 3: Verify in the browser**

```bash
pnpm dev
```

In a visible Chrome window:
1. The chip is in the menu's top-right corner and shows a speaker with two arcs.
2. Tapping it silences the music and the glyph gains a slash; tapping again restores both and plays a blip.
3. Reload while muted — it comes back muted, and the chip is drawn slashed on first paint.
4. In DevTools, `localStorage.getItem('mouse2:muted')` returns `'true'` / `'false'` accordingly.
5. Tapping the chip never launches a game.

- [ ] **Step 4: Verify tests and types**

Run: `pnpm test && pnpm build`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/ui/widgets.ts src/scenes/MenuScene.ts
git commit -m "feat(audio): a mute chip that remembers"
```

---

### Task 8: Dodger

**Files:**
- Modify: `src/scenes/GameScene.ts` — `create()` (~line 160), `resetState()` (~line 237), `firePlayerBullet()` (~line 531), `explodeEnemy()` (~line 601), the hit branch in `update()` (~line 481), `triggerGameOver()` (~line 644)

**Interfaces:**
- Consumes: `playSfx`, `playMusic`, `fadeOutMusic` from `audio/bus.ts`; `createSoundButton` from `ui/widgets.ts`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the imports**

```ts
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
```

and add `createSoundButton` to the existing `../ui/widgets` import list.

- [ ] **Step 2: Add the chip and the loop**

In `create()`, immediately after the existing `createBackButton(this, { ... });` call:

```ts
    createSoundButton(this, { accent: ACCENT });
```

At the end of `create()`:

```ts
    playMusic(this, 'dodger');
```

- [ ] **Step 3: Sound each event**

In `firePlayerBullet()`, after `this.playerBullets.push(bullet);`:

```ts
    playSfx(this, 'shoot');
```

In `explodeEnemy()`, as the first line of the method:

```ts
    playSfx(this, 'explode');
```

In `update()`, inside the `if (result.tookHit)` branch, after `this.cameras.main.shake(140, 0.006);`:

```ts
        playSfx(this, 'hurt');
```

In `triggerGameOver()`, after `this.state = 'gameOver';`:

```ts
    fadeOutMusic(this);
    playSfx(this, 'gameover');
```

In `resetState()`, at the end of the method — a restart brings the loop back:

```ts
    playMusic(this, 'dodger');
```

- [ ] **Step 4: Verify in the browser**

```bash
pnpm dev
```

In a visible Chrome window, play Dodger and confirm:
1. The Dodger loop starts on entry and the menu loop stops — never both at once.
2. Auto-fire ticks quietly and does not dominate the mix.
3. Killing an enemy explodes; losing a heart buzzes.
4. On game over the loop fades over ~400 ms under the descending sting.
5. Restarting from the card brings the loop back; going back to the menu returns the menu loop.
6. The mute chip sits under the back chip, works mid-run, and dragging from it does not teleport the ship.

- [ ] **Step 5: Verify tests and types**

Run: `pnpm test && pnpm build`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat(audio): sound Dodger"
```

---

### Task 9: Car Racer

**Files:**
- Modify: `src/scenes/CarScene.ts` — `create()` (~line 96), `resetState()` (~line 207), `update()` (~line 232), `triggerGameOver()` (~line 355); add one field beside `private elapsedMs!: number;` (~line 84)

**Interfaces:**
- Consumes: `playSfx`, `playMusic`, `fadeOutMusic` from `audio/bus.ts`; `createSoundButton` from `ui/widgets.ts`; the existing `getDistanceValue` import.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the imports and the milestone field**

```ts
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
```

Add `createSoundButton` to the existing `../ui/widgets` import list, and add the field:

```ts
  /** Metres at the last chime, so each 500 m boundary is announced once. */
  private lastMilestone = 0;
```

- [ ] **Step 2: Add the chip and the loop**

In `create()`, after the existing `createBackButton(this, { ... });`:

```ts
    createSoundButton(this, { accent: ACCENT });
```

At the end of `create()`:

```ts
    playMusic(this, 'car');
```

In `resetState()`, at the end:

```ts
    this.lastMilestone = 0;
    playMusic(this, 'car');
```

- [ ] **Step 3: Chime on each 500 m**

In `update()`, directly after the two existing pill updates
(`this.distancePill.setValue(...)` / `this.speedPill.setValue(...)`):

```ts
    // Floored to the boundary rather than incremented by 500, so a single
    // frame that crosses two boundaries still leaves the counter honest.
    const metres = getDistanceValue(this.distanceState);
    if (metres >= this.lastMilestone + MILESTONE_METRES) {
      this.lastMilestone = Math.floor(metres / MILESTONE_METRES) * MILESTONE_METRES;
      playSfx(this, 'milestone');
    }
```

Add the constant beside the other module constants at the top of the file:

```ts
/** How far apart the distance chimes are. */
const MILESTONE_METRES = 500;
```

- [ ] **Step 4: Sound the crash**

In `triggerGameOver()`, after `this.state = 'gameOver';`:

```ts
    fadeOutMusic(this);
    playSfx(this, 'crash');
    // A beat behind the impact, so the two do not smear into one noise.
    this.time.delayedCall(260, () => playSfx(this, 'gameover'));
```

- [ ] **Step 5: Verify in the browser**

```bash
pnpm dev
```

In a visible Chrome window, play Car Racer and confirm:
1. The car loop replaces the menu loop on entry.
2. A chime lands at 500 m, 1000 m, 1500 m — once each, never doubled.
3. Crashing gives a thud, then the sting a moment later, over a fading loop.
4. Restarting resets the chimes: the next 500 m chimes again.
5. The mute chip works mid-run and does not steer the car.

- [ ] **Step 6: Verify tests and types**

Run: `pnpm test && pnpm build`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/CarScene.ts
git commit -m "feat(audio): sound Car Racer"
```

---

### Task 10: Fish Catch

**Files:**
- Modify: `src/scenes/FishScene.ts` — `create()` (~line 132), `resetState()` (~line 256), `announceLevel()` (~line 327), `handleTap()` (~line 405), `catchPopup()` (~line 443), `dive()` (~line 476), `triggerTimeUp()` (~line 584); add one field beside `private levelIndex!: number;` (~line 119)

**Interfaces:**
- Consumes: `playSfx`, `playMusic`, `fadeOutMusic` from `audio/bus.ts`; `createSoundButton` from `ui/widgets.ts`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the imports and the streak field**

```ts
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
```

Add `createSoundButton` to the existing `../ui/widgets` import list, and add the field:

```ts
  /** Consecutive good catches, which is what walks the catch blip upward. */
  private streak = 0;
```

Add the module constants beside the other constants at the top of the file:

```ts
/** How far the catch blip climbs per catch, and where the climb stops. */
const STREAK_DETUNE_CENTS = 100;
const STREAK_DETUNE_MAX = 6;
```

- [ ] **Step 2: Add the chip and the loop**

In `create()`, after the existing `createBackButton(this, { ... });`:

```ts
    createSoundButton(this, { accent: ACCENT });
```

At the end of `create()`:

```ts
    playMusic(this, 'fish');
```

In `resetState()`, at the end:

```ts
    this.streak = 0;
    playMusic(this, 'fish');
```

- [ ] **Step 3: Sound a catch, with the streak in the pitch**

In `catchPopup()`, after the `color` constant is computed and before the tween block:

```ts
    if (popup.kind === 'trash') {
      // A can breaks the run: the next fish starts the climb over.
      this.streak = 0;
      playSfx(this, 'trash');
    } else {
      const detune = Math.min(this.streak, STREAK_DETUNE_MAX) * STREAK_DETUNE_CENTS;
      this.streak += 1;
      playSfx(this, popup.kind === 'rare' ? 'rare' : 'catch', { detune });
    }
```

- [ ] **Step 4: Sound the misses and the level change**

In `dive()`, as the first line:

```ts
    playSfx(this, 'plop');
```

In `announceLevel()`, as the first line:

```ts
    playSfx(this, 'levelup');
```

In `triggerTimeUp()`, after `this.timePill.setValue('0');`:

```ts
    fadeOutMusic(this);
    playSfx(this, 'timeup');
```

- [ ] **Step 5: Verify in the browser**

```bash
pnpm dev
```

In a visible Chrome window, play Fish Catch and confirm:
1. The pond loop replaces the menu loop on entry.
2. Catching fish in a row walks the blip up, and it stops climbing after six.
3. A can plays the thunk and resets the climb — the next fish is back at the bottom.
4. A gold fish sparkles; a fish diving untapped plops quietly.
5. The level toast is announced by the chime.
6. Time up fades the loop under the horn, and the card follows.
7. `triggerTimeUp` dives everything still up — confirm that is a handful of plops, not a wall of them. If it is a wall, move the `playSfx(this, 'plop')` out of `dive()` and into the `expired` loop in `update()` (~line 302), which is the only dive that is a genuine miss; `triggerTimeUp`'s dives then stay silent under the horn.
8. The mute chip works mid-run.

- [ ] **Step 6: Verify tests and types**

Run: `pnpm test && pnpm build`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/FishScene.ts
git commit -m "feat(audio): sound Fish Catch"
```

---

### Task 11: Full sweep and integration

**Files:**
- Modify: none expected. Fix whatever the sweep turns up.

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test && pnpm build`
Expected: PASS both, with the audio tests from Tasks 1 and 2 among them.

- [ ] **Step 2: Sweep every screen**

```bash
pnpm dev
```

In a visible Chrome window, walk the whole product and confirm:
1. Menu → each game → back to menu, twice around. Exactly one loop plays at any moment; none stack, restart mid-bar, or survive into the wrong scene.
2. Mute on the menu, enter a game: still muted, and the in-game chip is drawn slashed.
3. Mute mid-run, return to the menu: still muted; reload: still muted.
4. Switch to another browser tab for ten seconds and back: audio pauses and resumes with the game, and no loop doubles.
5. The DevTools console is free of `[audio]` warnings and of any Phaser sound errors.

- [ ] **Step 3: Check the boot cost**

In DevTools, reload with the Console open and confirm the page is interactive immediately — buffer rendering is asynchronous and must not block the first frame. In the Performance panel, the render work should be tens of milliseconds, not seconds. If it is seconds, halve the music loops to 16 steps and re-check.

- [ ] **Step 4: Commit any fixes**

Skip this step entirely if the sweep was clean. If it was not, fix what it found and commit with a message naming the defect, in the form:

```bash
git add -A
git commit -m "fix(audio): stop the menu loop surviving into Dodger"
```

- [ ] **Step 5: Finish the branch**

REQUIRED SUB-SKILL: use `superpowers:finishing-a-development-branch` to decide how this lands (PR against `main`, from branch `feature/game-audio`).

---

## Notes for the implementer

- **Phaser's audio cache takes raw `AudioBuffer`s.** `game.cache.audio.add(key, buffer)` is all the registration needed; `WebAudioSound` reads the buffer straight back out. There is no loader step and no asset URL anywhere in this plan.
- **`scene.sound` is the global sound manager**, not a per-scene one. Sounds added with `scene.sound.add` outlive the scene that added them — which is exactly why `playMusic` cuts the previous loop itself rather than trusting scene teardown.
- **Tweens do not outlive their scene.** Any fade started with `scene.tweens` must have a `SHUTDOWN` fallback, as `fadeOutMusic` does.
- **The first sound of a session needs a user gesture.** That is browser policy, not a bug; the first menu tap satisfies it. Do not try to start audio earlier.
