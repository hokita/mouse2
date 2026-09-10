import Phaser from 'phaser';
import { depthAt, scaleAt, projectX } from '../../core/perspective';
import type { Perspective } from '../../core/perspective';
import { HEIGHT, WIDTH } from '../../gameConfig';
import { PALETTE } from '../../ui/theme';
import { DEPTH } from '../../ui/widgets';

// The road, drawn in perspective: a vanishing point on the horizon, edges that
// converge on it, and markings spaced by how far down the track they are
// rather than by how far down the screen. That last part is the whole trick —
// evenly spaced depth is what makes the rumble strips crowd together at the
// horizon and burst apart as they arrive, which is most of what a player reads
// as speed.
//
// The geometry lives here rather than in CarScene because the scene's traffic
// is placed with it too: every car, pickup and palm is a thing standing on
// this ground plane.

/** Where the road's edges meet, and the bottom of the sky. */
export const HORIZON_Y = 190;

/**
 * The player's row — the one rank of road drawn at 1:1, and so the row every
 * other measurement in this file is given at. Low enough that the car sits in
 * the near field where the perspective is generous, high enough that the road
 * still runs on past it to the bottom of the screen.
 */
export const PLAYER_Y = HEIGHT - 140;

export const LANE_COUNT = 3;

const ROAD_MARGIN = 30;
/** The road's left edge and width, both measured at the player's row. */
export const ROAD_LEFT = ROAD_MARGIN;
export const ROAD_WIDTH = WIDTH - ROAD_MARGIN * 2;

export const PERSPECTIVE: Perspective = {
  horizonY: HORIZON_Y,
  baseY: PLAYER_Y,
  centerX: ROAD_LEFT + ROAD_WIDTH / 2,
};

/**
 * How far the camera sits behind the player's row, measured in the pixels of
 * road travel everything in this file is scrolled by.
 *
 * Set equal to the road's on-screen height on purpose. It is what fixes the
 * rate the markings sweep past the player at: at the player's row the pattern
 * moves one pixel for every pixel of travel, which is exactly the rate the
 * traffic moves down the screen at. Any other value and the road would
 * visibly slide along underneath the cars standing on it.
 */
const CAMERA_DEPTH = PLAYER_Y - HORIZON_Y;

/**
 * Pixels of road per metre of distance travelled.
 *
 * The flat road this replaced spawned traffic at the top of the screen and
 * scrolled a pixel a metre, which gave the player 762 px of warning to read
 * the lane ahead. The horizon sits lower than the top of the screen, so
 * keeping the pixel-a-metre scroll would have quietly cut that window by a
 * fifth and made the game harder than it was tuned to be. Distance is still
 * counted in metres; this is the exchange rate into the shorter picture.
 */
const TUNED_WARNING_PX = 762;
export const ROAD_PX_PER_METRE = (PLAYER_Y - HORIZON_Y) / TUNED_WARNING_PX;

/** Height of one drawn band of road. Small enough that the stepping on the
 * road's edges reads as an arcade artefact rather than as a mistake. */
const BAND_PX = 7;

/**
 * Bands are only worth drawing down to here; above it the road is a wedge of
 * flat colour under the haze, which is all the eye can resolve anyway.
 */
const MIN_BAND_SCALE = 0.05;

/** One block of rumble strip, in pixels of road travel — and so its height
 * in screen pixels as it passes the player. */
const RUMBLE_DEPTH = 34;
/** One lane-dash cycle, half of it painted. A multiple of RUMBLE_DEPTH so the
 * two patterns share a period and the scroll offset can wrap on it. */
const DASH_DEPTH = RUMBLE_DEPTH * 3;

// All widths at the player's row, scaled down with everything else as they
// recede.
const RUMBLE_WIDTH = 12;
const SHOULDER_WIDTH = 15;
const LANE_LINE_WIDTH = 7;

export interface Road {
  /** Brings the road `px` pixels closer and redraws it. */
  scroll(px: number): void;
  /** Back to a standing start, markings and all. */
  reset(): void;
}

export function createRoad(scene: Phaser.Scene): Road {
  const g = scene.add.graphics().setDepth(DEPTH.backdrop + 1);

  /**
   * How far the car has come, wrapped at the marking period. Wrapped rather
   * than left to grow because the only thing it is ever used for is which
   * half of a cycle a band falls in, and a float that has been adding up for
   * a ten-minute run makes a worse job of answering that.
   */
  let travelled = 0;

  const firstBandY = HORIZON_Y + MIN_BAND_SCALE * (PLAYER_Y - HORIZON_Y);

  const draw = (): void => {
    g.clear();

    // The ground plane, in the darker of the two verge greens. Every band
    // below paints over it, so this is only ever seen in the far distance
    // where the bands give out.
    g.fillStyle(PALETTE.vergeDark, 1);
    g.fillRect(0, HORIZON_Y, WIDTH, HEIGHT - HORIZON_Y);

    // The far wedge of road, from the vanishing point down to the first band
    // worth banding. Without it the road would begin at a hard edge partway
    // down the screen.
    const wedgeHalf = (ROAD_WIDTH / 2) * scaleAt(PERSPECTIVE, firstBandY);
    g.fillStyle(PALETTE.asphaltDark, 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(PERSPECTIVE.centerX, HORIZON_Y),
        new Phaser.Geom.Point(PERSPECTIVE.centerX + wedgeHalf, firstBandY + 1),
        new Phaser.Geom.Point(PERSPECTIVE.centerX - wedgeHalf, firstBandY + 1),
      ],
      true
    );

    for (let y = firstBandY; y < HEIGHT; y += BAND_PX) {
      // Sampled at the band's middle, so a band is wrong by at most half its
      // own height rather than by all of it.
      const middle = y + BAND_PX / 2;
      const scale = scaleAt(PERSPECTIVE, middle);
      const depth = depthAt(PERSPECTIVE, middle, CAMERA_DEPTH) + travelled;
      // A seam of background between two bands is far more visible than a
      // pixel of overlap, so every band is drawn a pixel taller than its pitch.
      const height = Math.min(BAND_PX + 1, HEIGHT - y);
      const light = Math.floor(depth / RUMBLE_DEPTH) % 2 === 0;

      const halfRoad = (ROAD_WIDTH / 2) * scale;
      const left = PERSPECTIVE.centerX - halfRoad;
      const right = PERSPECTIVE.centerX + halfRoad;

      if (light) {
        g.fillStyle(PALETTE.verge, 1);
        g.fillRect(0, y, WIDTH, height);
      }

      // Shoulder, asphalt and rumble strips, outermost first: one fill for the
      // shoulder either side of the road rather than two, since the asphalt
      // goes straight over its middle.
      const shoulder = SHOULDER_WIDTH * scale;
      g.fillStyle(PALETTE.sand, 1);
      g.fillRect(left - shoulder, y, halfRoad * 2 + shoulder * 2, height);

      g.fillStyle(light ? PALETTE.asphalt : PALETTE.asphaltDark, 1);
      g.fillRect(left, y, halfRoad * 2, height);

      const rumble = RUMBLE_WIDTH * scale;
      g.fillStyle(light ? PALETTE.kerbRed : PALETTE.laneLine, 1);
      g.fillRect(left, y, rumble, height);
      g.fillRect(right - rumble, y, rumble, height);

      // Lane dashes, painted for the first half of each cycle.
      if (depth % DASH_DEPTH < DASH_DEPTH / 2) {
        g.fillStyle(PALETTE.laneLine, 0.9);
        const lineWidth = LANE_LINE_WIDTH * scale;
        for (let boundary = 1; boundary < LANE_COUNT; boundary += 1) {
          const x = projectX(PERSPECTIVE, ROAD_LEFT + (ROAD_WIDTH * boundary) / LANE_COUNT, middle);
          g.fillRect(x - lineWidth / 2, y, lineWidth, height);
        }
      }
    }
  };

  draw();

  return {
    scroll(px: number): void {
      travelled = (travelled + px) % DASH_DEPTH;
      draw();
    },
    reset(): void {
      travelled = 0;
      draw();
    },
  };
}
