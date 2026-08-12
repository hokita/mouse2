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
