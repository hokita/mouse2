import Phaser from 'phaser';
import { scaleAt, screenXAt, screenYAt } from '../../core/perspective';
import type { Camera } from '../../core/perspective';
import { createTrack } from '../../core/track';
import type { Track } from '../../core/track';
import { HEIGHT, WIDTH } from '../../gameConfig';
import { PALETTE } from '../../ui/theme';
import { DEPTH } from '../../ui/widgets';

// The road, drawn the way the arcade cabinets drew it: as a stack of strips
// laid from the car outward, each one projected on its own and each one a
// little further up the screen than the last.
//
// Two things fall out of that for free, and they are the two things a flat
// road can never have. Add up every bend between the camera and a strip and
// the road leans off to the side — a corner. Read each strip's height against
// the height of the ground under the camera and the road rises and falls —
// a hill, complete with a brow that hides what is over it, because a strip
// that lands lower on screen than the one in front of it is not drawn at all.
//
// The geometry lives here rather than in CarScene because the scene's traffic
// stands on it: a car, a pickup and a palm are all placed by `place`, so they
// lean into the corners and ride over the crests without knowing either
// exists.

/** Screen y a flat road runs away to. */
export const HORIZON_Y = 190;

/** The player's row: the rank of road drawn at 1:1, and where the car sits. */
export const PLAYER_Y = HEIGHT - 140;

export const LANE_COUNT = 3;

const ROAD_MARGIN = 30;
/** The road's left edge and width, both measured at the player's row. */
export const ROAD_LEFT = ROAD_MARGIN;
export const ROAD_WIDTH = WIDTH - ROAD_MARGIN * 2;

/**
 * The eye. Its depth sets how hard the world foreshortens: near enough that
 * traffic arrives out of the horizon as a dot, far enough that the last few
 * metres before a bumper are not a blur.
 */
export const CAMERA: Camera = {
  horizonY: HORIZON_Y,
  baseY: PLAYER_Y,
  centerX: ROAD_LEFT + ROAD_WIDTH / 2,
  depth: 260,
  height: 300,
};

/** Length of one strip of road, in metres. */
const SEGMENT = 16;
/** How far ahead the road is drawn, in segments — out to where the fog closes.
 * Strips past that are a fraction of a pixel tall and the colour of the haze
 * they would be drawn into, so they are hundreds of quads a frame spent on
 * nothing. */
const AHEAD = 130;
/**
 * And how far behind. The eye sits back from the car, so without a few strips
 * laid behind it the bottom of the screen would have no road on it at all.
 */
const BEHIND = 12;

/** Nearer to the eye than this and a strip's size stops meaning anything. */
const NEAREST = -CAMERA.depth * 0.8;

// Widths at the player's row, where the projection is 1:1.
const RUMBLE_WIDTH = 12;
const SHOULDER_WIDTH = 15;
const LANE_LINE_WIDTH = 7;

/** Segments of lane dash, then the same again of gap. */
const DASH_SEGMENTS = 2;

// Distance closes the picture down into the light the road is driving toward.
// Doing it per strip rather than with one band over the top is what lets a
// hill stand out of the haze instead of being wiped flat by it.
const FOG_NEAR = 260;
const FOG_FAR = 1900;
const FOG_MAX = 0.94;
const FOG_COLOR = PALETTE.sunsetLow;

/** Where something standing on the road ends up on screen. */
export interface Placement {
  x: number;
  y: number;
  scale: number;
  /** 0 in the clear, 1 lost in the haze. */
  fog: number;
  /**
   * False when the road it is standing on is over the brow of a hill.
   *
   * Ground beyond a crest projects *lower* on the screen than the crest does —
   * that is exactly why the strips there are not drawn — so a car standing on
   * it would otherwise be painted in the middle of the near road, a toy-sized
   * thing sitting on tarmac fifty metres away.
   */
  visible: boolean;
}

export interface Road {
  /** Drives `metres` further along and redraws. */
  advance(metres: number): void;
  /** A fresh road, back at the start line. */
  reset(): void;
  /** Where something at depth `z`, `offsetX` from the road's centre, stands. */
  place(z: number, offsetX: number): Placement;
  /** How hard the road is bending under the car right now. */
  curveHere(): number;
  /** How far the road ahead has swung off straight, in screen pixels. */
  sway(): number;
}

export function createRoad(scene: Phaser.Scene): Road {
  const g = scene.add.graphics().setDepth(DEPTH.backdrop + 1);

  let track: Track = createTrack();
  /** Metres travelled. Only ever grows; the track's ring buffer is what stops
   * a long run from piling up. */
  let position = 0;

  // The survey: one pass per frame that works out where every strip's near
  // edge sits, so that drawing and placing both read the same answer.
  const strips = BEHIND + AHEAD + 2;
  /** Lateral drift of the road's centre line, in world units. */
  const offsets = new Float64Array(strips);
  /** Height above the ground under the camera. */
  const rises = new Float64Array(strips);
  /** Depth ahead of the player's row. */
  const depths = new Float64Array(strips);
  /**
   * How far down the screen was still unpainted when each strip's turn came.
   * A strip — or anything standing on it — that falls below its own line is
   * over a brow and out of sight.
   */
  const clips = new Float64Array(strips);
  let base = 0;
  let through = 0;

  const fogCache = new Map<number, number>();

  /** `color` seen through `fog` of the light at the end of the road. */
  const fogged = (color: number, fog: number): number => {
    const step = Math.round(fog * 12);
    const key = color * 16 + step;
    const cached = fogCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(color),
      Phaser.Display.Color.IntegerToColor(FOG_COLOR),
      12,
      step
    );
    const value = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
    fogCache.set(key, value);
    return value;
  };

  const fogAt = (z: number): number =>
    Phaser.Math.Clamp((z - FOG_NEAR) / (FOG_FAR - FOG_NEAR), 0, 1) * FOG_MAX;

  const survey = (): void => {
    base = Math.floor(position / SEGMENT);
    through = position / SEGMENT - base;
    const groundHere =
      track.riseAt(base) + (track.riseAt(base + 1) - track.riseAt(base)) * through;

    // Outward from the car. `dx` is the road's heading and every segment's
    // curve bends it a little further, so the centre line's drift grows with
    // the square of the distance — which is exactly how a corner looks.
    let x = 0;
    let dx = -track.curveAt(base) * through;
    for (let n = 0; n <= AHEAD + 1; n += 1) {
      const i = n + BEHIND;
      offsets[i] = x;
      rises[i] = track.riseAt(base + n) - groundHere;
      depths[i] = (base + n) * SEGMENT - position;
      x += dx;
      dx += track.curveAt(base + n);
    }

    // And backward, running the same walk in reverse, for the road under the
    // car and the stretch of it behind.
    x = 0;
    dx = -track.curveAt(base) * through;
    for (let n = -1; n >= -BEHIND; n -= 1) {
      const i = n + BEHIND;
      dx -= track.curveAt(base + n);
      x -= dx;
      offsets[i] = x;
      rises[i] = track.riseAt(base + n) - groundHere;
      depths[i] = (base + n) * SEGMENT - position;
    }
  };

  // One set of corners, written over and over. A strip is half a dozen quads
  // and there are a hundred strips in a frame, so building the points fresh
  // each time would hand the collector a few thousand short-lived objects
  // sixty times a second for no gain at all — fillPoints reads them and is
  // done with them before this function returns.
  const corners = [
    new Phaser.Geom.Point(),
    new Phaser.Geom.Point(),
    new Phaser.Geom.Point(),
    new Phaser.Geom.Point(),
  ];

  /**
   * One trapezoid of road furniture, near edge to far edge.
   *
   * Drawn a pixel past its near edge, into the strip in front of it. Strips
   * are laid nearest first, so that overlap lands on tarmac already painted
   * the same colour — while leaving it out lets a hairline of verge through
   * at every seam, and a road with a green thread across it every few
   * centimetres is the one thing that would give the whole illusion away.
   */
  const quad = (
    nearLeft: number,
    nearRight: number,
    nearY: number,
    farLeft: number,
    farRight: number,
    farY: number
  ): void => {
    corners[0].setTo(nearLeft, nearY + 1);
    corners[1].setTo(farLeft, farY);
    corners[2].setTo(farRight, farY);
    corners[3].setTo(nearRight, nearY + 1);
    g.fillPoints(corners, true);
  };

  const draw = (): void => {
    g.clear();

    // Nothing further up the screen than this has been drawn yet; a strip that
    // would land below it is over the brow of a hill and out of sight.
    let clip = HEIGHT;
    clips.fill(HEIGHT);

    for (let n = -BEHIND; n <= AHEAD; n += 1) {
      const i = n + BEHIND;
      clips[i] = clip;
      const nearZ = depths[i];
      if (nearZ <= NEAREST) {
        continue;
      }
      const farZ = depths[i + 1];
      const nearY = screenYAt(CAMERA, nearZ, rises[i]);
      const farY = screenYAt(CAMERA, farZ, rises[i + 1]);
      if (farY >= clip) {
        continue;
      }
      if (farY < 0) {
        break;
      }
      clip = farY;

      const index = base + n;
      // Every other segment is the pale one. The alternation is anchored to
      // the road rather than to the screen, so the markings sweep toward the
      // car instead of sitting still under it.
      const pale = (((index % 2) + 2) % 2) === 0;
      const fog = fogAt(nearZ);

      const nearScale = scaleAt(CAMERA, nearZ);
      const farScale = scaleAt(CAMERA, farZ);
      const nearX = screenXAt(CAMERA, nearZ, offsets[i]);
      const farX = screenXAt(CAMERA, farZ, offsets[i + 1]);
      const nearHalf = (ROAD_WIDTH / 2) * nearScale;
      const farHalf = (ROAD_WIDTH / 2) * farScale;

      // The verge runs the full width; the road is painted over its middle.
      // This one grows the other way, out past its far edge, so that its
      // overlap lands where the next strip's verge will cover it rather than
      // on the tarmac of the strip in front.
      g.fillStyle(fogged(pale ? PALETTE.verge : PALETTE.vergeDark, fog), 1);
      g.fillRect(0, farY - 1, WIDTH, nearY - farY + 1);

      // Shoulders, in one piece under the road rather than two beside it.
      const nearShoulder = SHOULDER_WIDTH * nearScale;
      const farShoulder = SHOULDER_WIDTH * farScale;
      g.fillStyle(fogged(PALETTE.sand, fog), 1);
      quad(
        nearX - nearHalf - nearShoulder,
        nearX + nearHalf + nearShoulder,
        nearY,
        farX - farHalf - farShoulder,
        farX + farHalf + farShoulder,
        farY
      );

      g.fillStyle(fogged(pale ? PALETTE.asphalt : PALETTE.asphaltDark, fog), 1);
      quad(nearX - nearHalf, nearX + nearHalf, nearY, farX - farHalf, farX + farHalf, farY);

      const nearRumble = RUMBLE_WIDTH * nearScale;
      const farRumble = RUMBLE_WIDTH * farScale;
      g.fillStyle(fogged(pale ? PALETTE.kerbRed : PALETTE.laneLine, fog), 1);
      quad(
        nearX - nearHalf,
        nearX - nearHalf + nearRumble,
        nearY,
        farX - farHalf,
        farX - farHalf + farRumble,
        farY
      );
      quad(
        nearX + nearHalf - nearRumble,
        nearX + nearHalf,
        nearY,
        farX + farHalf - farRumble,
        farX + farHalf,
        farY
      );

      if ((((index % (DASH_SEGMENTS * 2)) + DASH_SEGMENTS * 2) % (DASH_SEGMENTS * 2)) < DASH_SEGMENTS) {
        g.fillStyle(fogged(PALETTE.laneLine, fog), 0.9);
        const nearLine = (LANE_LINE_WIDTH * nearScale) / 2;
        const farLine = (LANE_LINE_WIDTH * farScale) / 2;
        for (let boundary = 1; boundary < LANE_COUNT; boundary += 1) {
          const lane = (ROAD_WIDTH * boundary) / LANE_COUNT - ROAD_WIDTH / 2;
          const nearLaneX = nearX + lane * nearScale;
          const farLaneX = farX + lane * farScale;
          quad(
            nearLaneX - nearLine,
            nearLaneX + nearLine,
            nearY,
            farLaneX - farLine,
            farLaneX + farLine,
            farY
          );
        }
      }
    }
  };

  const place = (z: number, offsetX: number): Placement => {
    // Which strip the thing is standing on, and how far through it.
    const along = z / SEGMENT + through;
    const i = Phaser.Math.Clamp(Math.floor(along) + BEHIND, 0, strips - 2);
    const t = Phaser.Math.Clamp(along + BEHIND - i, 0, 1);
    const offset = offsets[i] + (offsets[i + 1] - offsets[i]) * t;
    const rise = rises[i] + (rises[i + 1] - rises[i]) * t;
    const y = screenYAt(CAMERA, z, rise);

    return {
      x: screenXAt(CAMERA, z, offsetX + offset),
      y,
      scale: scaleAt(CAMERA, z),
      fog: fogAt(z),
      visible: y <= clips[i],
    };
  };

  survey();
  draw();

  return {
    advance(metres: number): void {
      position += metres;
      survey();
      draw();
    },

    reset(): void {
      track = createTrack();
      position = 0;
      survey();
      draw();
    },

    place,

    curveHere(): number {
      return track.curveAt(base);
    },

    sway(): number {
      // Read off the road itself rather than kept as a running total: a total
      // would drift, and this cannot — it is zero whenever the road ahead is
      // straight, whatever the car did to get here.
      return place(1400, 0).x - CAMERA.centerX;
    },
  };
}
