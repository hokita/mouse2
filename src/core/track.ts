/**
 * The shape of the road ahead: where it bends, and where it climbs.
 *
 * The road is a run of equal-length segments, each carrying two numbers — how
 * hard it turns, and how high it sits. Nothing here knows about pixels or
 * about the screen. A renderer walks the segments outward from the camera,
 * adding up the turns as it goes, and that accumulation is what draws a bend;
 * the heights are read against whatever the camera is standing on, and that is
 * what draws a hill.
 *
 * It is generated a section at a time and kept in a ring buffer, because an
 * endless road that remembered every metre it had ever laid would be an
 * endless leak. Only the stretch around the player is retained — far more than
 * the renderer or the traffic ever look at, and far less than a long run would
 * otherwise pile up.
 */

/** How much of the road is kept in memory, in segments. */
const CAPACITY = 256;

/** The opening stretch of every run: dead straight and flat. */
const OPENING_SEGMENTS = 50;

const SECTION_MIN = 20;
const SECTION_MAX = 46;

/**
 * Turn strengths, in lateral units added to the road's heading per segment.
 * A sharp one swings the far end of the road clean off the side of the screen,
 * which is what a sharp bend is supposed to do.
 */
const CURVES = [0, 0, 0.1, 0.1, 0.22, 0.4];

/** Height changes a section can make, in the units the camera's own height is
 * given in. Kept well under that height: the road goes out of sight over the
 * brow of a rise, and a hill that hid the next three hundred metres of traffic
 * would be a hill the player crashed into blind. */
const RISES = [0, 0, 40, 80, 125];

/** Height the road stays within, so a run of climbs cannot become a wall. */
const MAX_RISE = 260;

/**
 * The steepest the road is allowed to climb, per segment. A big climb is given
 * the length it needs to make it gently rather than being crammed into
 * whatever section length came up — the steeper the brow, the more road it
 * hides, and road the player cannot see is traffic the player cannot read.
 */
const MAX_SLOPE = 2.8;

export interface Track {
  /**
   * How hard segment `index` turns. Positive bends the road right. Generates
   * more road if the question runs off the end of what exists.
   */
  curveAt(index: number): number;
  /** How high segment `index` stands. */
  riseAt(index: number): number;
}

/** A stretch of road with one bend and one climb in it. */
interface Section {
  length: number;
  laid: number;
  curve: number;
  from: number;
  to: number;
}

/** Smooth at both ends, so a hill has a brow rather than a corner. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function pick<T>(from: readonly T[], random: () => number): T {
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))];
}

export function createTrack(random: () => number = Math.random): Track {
  const curves = new Float64Array(CAPACITY);
  const rises = new Float64Array(CAPACITY);

  /** The first index not yet laid down. */
  let next = 0;
  let elevation = 0;

  let section: Section = {
    length: OPENING_SEGMENTS,
    laid: 0,
    curve: 0,
    from: 0,
    to: 0,
  };

  const nextSection = (): Section => {
    const curve = pick(CURVES, random) * (random() < 0.5 ? -1 : 1);
    let climb = pick(RISES, random) * (random() < 0.5 ? -1 : 1);
    // Turn a climb around rather than let the road walk out of its range: the
    // alternative is a section that quietly does nothing, and a flat spot the
    // generator did not choose is a flat spot nobody tuned.
    if (Math.abs(elevation + climb) > MAX_RISE) {
      climb = -climb;
    }
    return {
      length: Math.max(
        SECTION_MIN + Math.floor(random() * (SECTION_MAX - SECTION_MIN)),
        Math.ceil(Math.abs(climb) / MAX_SLOPE)
      ),
      laid: 0,
      curve,
      from: elevation,
      to: elevation + climb,
    };
  };

  const lay = (): void => {
    if (section.laid >= section.length) {
      section = nextSection();
    }
    const through = (section.laid + 0.5) / section.length;
    const slot = next % CAPACITY;
    // A half-sine over the section: the bend arrives and leaves rather than
    // switching on, so the road never kinks at a section's seam.
    curves[slot] = section.curve * Math.sin(Math.PI * through);
    rises[slot] = section.from + (section.to - section.from) * smoothstep(through);
    elevation = rises[slot];
    section.laid += 1;
    next += 1;
  };

  /** Lays road until `index` exists, and reports where to find it. */
  const slotFor = (index: number): number => {
    while (next <= index) {
      lay();
    }
    // Anything older than the ring has been overwritten. Nothing asks for it —
    // the renderer looks a dozen segments back at most — but answering with
    // the oldest road retained beats answering with a stranger's.
    const oldest = Math.max(0, next - CAPACITY);
    return Math.max(index, oldest) % CAPACITY;
  };

  return {
    curveAt(index: number): number {
      return curves[slotFor(index)];
    },
    riseAt(index: number): number {
      return rises[slotFor(index)];
    },
  };
}
