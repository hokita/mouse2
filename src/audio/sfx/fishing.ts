import { noteToFreq } from '../notes';
import { noise, tone } from '../synth';
import type { SfxSpec } from './spec';

// --- Fish Catch --------------------------------------------------------

export const FISHING = {
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
} satisfies Record<string, SfxSpec>;
