import Phaser from 'phaser';
import { ensurePalmTexture } from '../../ui/textures';
import { DEPTH } from '../../ui/widgets';
import { ROAD_WIDTH } from './road';
import type { Road } from './road';

// Palms down both verges. They are the one piece of scenery that is neither
// road nor sky, and they earn their frame time for something the road cannot
// do on its own: the markings tell the player how fast the ground is moving,
// and the palms tell them how far away it is. Something that grows from a twig
// on the horizon to taller than the car as it goes by is what sells the third
// dimension — and on a bend they are what the road is bending past.

/** How far apart consecutive palms stand, in metres. */
const SPACING = 130;

/** Out beyond the shoulder, so a palm never looks like it is on the tarmac. */
const VERGE_OFFSET = ROAD_WIDTH / 2 + 40;

/** Height at the player's row. Taller than the car, as a palm should be. */
const PALM_SCALE = 1.3;

/** Planted this far out, so they arrive out of the haze rather than appear. */
const PLANT_DEPTH = 2000;

/** Felled once they are behind the camera and off the bottom of the screen. */
const PASSED_DEPTH = -120;

interface Palm {
  image: Phaser.GameObjects.Image;
  /** Metres of road ahead of the player. */
  z: number;
  /** -1 for the left verge, +1 for the right. */
  side: number;
}

export interface PalmAvenue {
  /** Brings every palm `metres` closer, planting and felling as needed. */
  advance(metres: number): void;
  /** Clears the avenue and plants a fresh one down the whole road. */
  reset(): void;
}

export function createPalmAvenue(scene: Phaser.Scene, road: Road): PalmAvenue {
  const texture = ensurePalmTexture(scene);
  let palms: Palm[] = [];
  /** Metres since the last one was planted. */
  let sinceLast = 0;
  /** Which verge the next palm goes on. They alternate. */
  let nextSide = -1;

  /** Stands a palm on the ground: scaled, leant into the bend, hazed. */
  const place = (palm: Palm): void => {
    const at = road.place(palm.z, palm.side * VERGE_OFFSET);
    palm.image
      .setPosition(at.x, at.y)
      .setScale(at.scale * PALM_SCALE)
      .setAlpha(1 - at.fog)
      // Hidden along with the road it is planted on, when that is over a brow.
      .setVisible(at.visible)
      // Above the road but below the traffic, and nearer palms over farther
      // ones. The whole avenue still sits in the gap under DEPTH.world.
      .setDepth(DEPTH.backdrop + 2 + Math.min(at.scale, 5));
  };

  const plant = (z: number, side: number): void => {
    const palm: Palm = {
      // Origin at the foot of the trunk: that is the point standing on the
      // ground, and so the point the perspective is about.
      image: scene.add.image(0, 0, texture).setOrigin(0.5, 1),
      z,
      side,
    };
    place(palm);
    palms.push(palm);
  };

  return {
    advance(metres: number): void {
      sinceLast += metres;
      while (sinceLast >= SPACING) {
        sinceLast -= SPACING;
        plant(PLANT_DEPTH, nextSide);
        nextSide = -nextSide;
      }

      palms = palms.filter((palm) => {
        palm.z -= metres;
        if (palm.z < PASSED_DEPTH) {
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

      // A run starts mid-avenue rather than with an empty verge that fills in
      // over the first few seconds.
      //
      // Seeded from the far end inward rather than from the car outward, so
      // that the avenue is in step with the cadence `advance` plants at. The
      // spacing does not divide the planting distance, so seeding outward
      // leaves the last palm short of it — and the first one planted after
      // the run starts then lands a spacing and a bit further on, putting one
      // stretched gap in an otherwise even avenue.
      const farthest = -1;
      let side = farthest;
      for (let z = PLANT_DEPTH; z > 0; z -= SPACING) {
        plant(z, side);
        side = -side;
      }
      // The next palm arrives behind the farthest one seeded, so it takes the
      // verge that one did not.
      nextSide = -farthest;
    },
  };
}
