import { noteToFreq } from './notes';
import { noise, tone } from './synth';

// The whole vocabulary of the game in sixteen sounds. Each one is a handful
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
  | 'bite'
  | 'snap'
  | 'levelup'
  | 'timeup'
  | 'slash'
  | 'cast'
  | 'weak'
  | 'guard'
  | 'heal'
  | 'afflict';

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

  // --- Big Bite ----------------------------------------------------------

  bite: {
    durationSec: 0.32,
    volume: 0.6,
    render(ctx, dest) {
      // The bobber going under: a hard downward plunge where plop rises —
      // the two must never be mistaken for each other, because one means
      // "strike now" and the other means nothing.
      tone(ctx, dest, {
        type: 'sine',
        freq: 620,
        endFreq: 150,
        start: 0,
        duration: 0.16,
        gain: 0.55,
        attack: 0.04,
      });
      noise(ctx, dest, {
        start: 0.02,
        duration: 0.22,
        gain: 0.18,
        filterStart: 2600,
        filterEnd: 500,
      });
    },
  },

  snap: {
    durationSec: 0.42,
    volume: 0.55,
    render(ctx, dest) {
      // The line breaking: a bright crack, then the rod going slack as a
      // falling tone. The crack is nearly all noise — a snapped line has no
      // pitch, only the thud after it.
      noise(ctx, dest, {
        start: 0,
        duration: 0.07,
        gain: 0.6,
        filterStart: 7000,
        filterEnd: 2400,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: 340,
        endFreq: 70,
        start: 0.05,
        duration: 0.3,
        gain: 0.3,
        attack: 0.05,
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

  // --- Sigil ---------------------------------------------------------------
  // A turn-based fight has long silences in it, so each of these has to carry
  // a whole beat on its own. They are pitched apart on purpose: the party's
  // sounds sit high and clean, what lands on the party sits low and dirty.

  slash: {
    durationSec: 0.2,
    volume: 0.4,
    render(ctx, dest) {
      // Steel: a fast noise sweep downward, with just enough tone under it to
      // have a pitch rather than read as static.
      noise(ctx, dest, {
        start: 0,
        duration: 0.14,
        gain: 0.3,
        filterStart: 7000,
        filterEnd: 900,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A4'),
        endFreq: noteToFreq('D4'),
        start: 0,
        duration: 0.12,
        gain: 0.28,
        attack: 0.02,
      });
    },
  },

  cast: {
    durationSec: 0.34,
    volume: 0.4,
    render(ctx, dest) {
      // Rising, so a spell sounds like something being spent rather than
      // something landing. The impact is `weak` or `slash`, not this.
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('D4'),
        endFreq: noteToFreq('D6'),
        start: 0,
        duration: 0.26,
        gain: 0.34,
        attack: 0.1,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A4'),
        endFreq: noteToFreq('A5'),
        start: 0.03,
        duration: 0.22,
        gain: 0.18,
        attack: 0.1,
      });
    },
  },

  weak: {
    durationSec: 0.5,
    volume: 0.62,
    render(ctx, dest) {
      // The loudest thing in the game, because hitting a weakness is the one
      // thing it wants the player to notice. A struck fifth plus a body of
      // noise: bright, wide, and clearly a reward.
      for (const [note, gain] of [['D5', 0.4], ['A5', 0.3], ['D6', 0.22]] as const) {
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq(note),
          start: 0,
          duration: 0.34,
          gain,
          attack: 0.02,
        });
      }
      noise(ctx, dest, {
        start: 0,
        duration: 0.3,
        gain: 0.24,
        filterStart: 5200,
        filterEnd: 700,
      });
    },
  },

  guard: {
    durationSec: 0.26,
    volume: 0.36,
    render(ctx, dest) {
      // Dull and low: something absorbing rather than something breaking.
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('A2'),
        start: 0,
        duration: 0.2,
        gain: 0.42,
        attack: 0.08,
      });
      noise(ctx, dest, {
        start: 0,
        duration: 0.12,
        gain: 0.12,
        filterStart: 700,
        filterEnd: 220,
      });
    },
  },

  heal: {
    durationSec: 0.4,
    volume: 0.42,
    render(ctx, dest) {
      // Two notes up a major third - the only major interval in the whole
      // game, so mending is the one sound that is unambiguously good news.
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('F5'),
        start: 0,
        duration: 0.16,
        gain: 0.36,
        attack: 0.06,
      });
      tone(ctx, dest, {
        type: 'sine',
        freq: noteToFreq('A5'),
        start: 0.12,
        duration: 0.24,
        gain: 0.32,
        attack: 0.06,
      });
    },
  },

  afflict: {
    durationSec: 0.42,
    volume: 0.44,
    render(ctx, dest) {
      // Sagging: a pitch that slides down and never arrives anywhere.
      tone(ctx, dest, {
        type: 'sawtooth',
        freq: noteToFreq('C4'),
        endFreq: noteToFreq('F#2'),
        start: 0,
        duration: 0.34,
        gain: 0.26,
        attack: 0.1,
      });
      noise(ctx, dest, {
        start: 0.04,
        duration: 0.26,
        gain: 0.1,
        filterStart: 1600,
        filterEnd: 300,
      });
    },
  },
};
