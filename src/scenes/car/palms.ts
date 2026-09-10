import Phaser from 'phaser';
import { projectX, scaleAt } from '../../core/perspective';
import { HEIGHT } from '../../gameConfig';
import { PALM_HEIGHT, ensurePalmTexture } from '../../ui/textures';
import { DEPTH } from '../../ui/widgets';
import { HORIZON_Y, PERSPECTIVE, ROAD_WIDTH } from './road';

// Palms down both verges. They are the one piece of scenery that is neither
// road nor sky, and they are worth their frame time for a reason the road
// cannot manage on its own: the road's markings tell the player how fast the
// ground is moving, and the palms tell them how far away it is. Something that
// grows from a twig at the horizon to taller than the car as it goes by is
// what sells the third dimension.

/** How far apart consecutive palms are, in pixels of road travel. */
const SPACING_PX = 168;

/** Clear of the shoulder, so a palm never looks like it is on the tarmac. */
const VERGE_OFFSET = ROAD_WIDTH / 2 + 38;

/** Height at the player's row. Taller than the car, as a palm should be. */
const PALM_SCALE = 1.25;

interface Palm {
  image: Phaser.GameObjects.Image;
  /** -1 for the left verge, +1 for the right. */
  side: number;
}

export interface PalmAvenue {
  /** Brings every palm `px` closer, planting and felling as needed. */
  scroll(px: number): void;
  /** Clears the avenue and plants a fresh one down the whole road. */
  reset(): void;
}

export function createPalmAvenue(scene: Phaser.Scene): PalmAvenue {
  const texture = ensurePalmTexture(scene);
  let palms: Palm[] = [];
  /** Distance since the last one was planted. */
  let sinceLast = 0;
  /** Which verge the next palm goes on. They alternate. */
  let nextSide = -1;

  /** Stands a palm on the ground at row `y`: scaled, projected, planted. */
  const place = (palm: Palm): void => {
    const y = palm.image.y;
    const scale = scaleAt(PERSPECTIVE, y);
    palm.image.setX(projectX(PERSPECTIVE, PERSPECTIVE.centerX + palm.side * VERGE_OFFSET, y));
    palm.image.setScale(scale * PALM_SCALE);
    // Into the haze along with everything else at the horizon.
    palm.image.setAlpha(Phaser.Math.Clamp((y - HORIZON_Y) / 70, 0, 1));
  };

  const plant = (y: number, side: number): void => {
    const palm: Palm = {
      // Origin at the foot of the trunk: that is the point standing on the
      // ground, and so the point the perspective is about.
      image: scene.add
        .image(0, y, texture)
        .setOrigin(0.5, 1)
        // Below the traffic but above the road, so a palm that leans over the
        // verge still passes behind the cars.
        .setDepth(DEPTH.backdrop + 2),
      side,
    };
    place(palm);
    palms.push(palm);
  };

  return {
    scroll(px: number): void {
      sinceLast += px;
      while (sinceLast >= SPACING_PX) {
        sinceLast -= SPACING_PX;
        // Planted at the horizon itself, where a palm is a couple of pixels
        // tall, rather than at the top of the screen — there is no road up
        // there any more.
        plant(HORIZON_Y, nextSide);
        nextSide = -nextSide;
      }

      palms = palms.filter((palm) => {
        palm.image.y += px;
        if (palm.image.y > HEIGHT + PALM_HEIGHT * PALM_SCALE) {
          palm.image.destroy();
          return false;
        }
        place(palm);
        return true;
      });
    },

    reset(): void {
      for (const palm of palms) {
        palm.image.destroy();
      }
      palms = [];
      sinceLast = 0;
      nextSide = -1;

      // A run starts mid-avenue rather than with an empty verge that fills in
      // over the first few seconds.
      for (let y = HORIZON_Y; y < HEIGHT; y += SPACING_PX) {
        plant(y, nextSide);
        nextSide = -nextSide;
      }
    },
  };
}
