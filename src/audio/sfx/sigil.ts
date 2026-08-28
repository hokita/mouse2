import { noteToFreq } from '../notes';
import { noise, tone } from '../synth';
import type { SfxSpec } from './spec';

// --- Sigil ---------------------------------------------------------------
// A turn-based fight has long silences in it, so each of these has to carry
// a whole beat on its own. They are pitched apart on purpose: the party's
// sounds sit high and clean, what lands on the party sits low and dirty.

export const SIGIL = {
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

  cast: {
    durationSec: 0.34,
    volume: 0.4,
    render(ctx, dest) {
      // Rising, so a spell sounds like something being spent rather than
      // something landing. The impact is `weak` or `slash`, not this. This is
      // specifically the colourless magic: force, nova, pulse, mend, chorus.
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

  weak: {
    durationSec: 0.5,
    volume: 0.62,
    render(ctx, dest) {
      // The loudest thing in a fight, because hitting a weakness is the one
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
} satisfies Record<string, SfxSpec>;
