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
} satisfies Record<string, SfxSpec>;
