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
} satisfies Record<string, SfxSpec>;
