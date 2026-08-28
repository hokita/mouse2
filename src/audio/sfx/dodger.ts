import { noteToFreq } from '../notes';
import { noise, tone } from '../synth';
import type { SfxSpec } from './spec';

// --- Dodger ------------------------------------------------------------

export const DODGER = {
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
} satisfies Record<string, SfxSpec>;
