import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../../gameConfig';
import { PALETTE } from '../../ui/theme';
import {
  SUN_SIZE,
  TEX,
  ensureCloudTexture,
  ensureFxTextures,
  ensureHillsTexture,
  ensureSkyTexture,
  ensureSunTexture,
} from '../../ui/textures';
import { DEPTH } from '../../ui/widgets';
import { HORIZON_Y, PERSPECTIVE } from './road';

// Everything above the road, and the one thing laid back over it: the haze the
// far end of the road dissolves into.
//
// The sun is centred on the vanishing point rather than parked off to one side.
// It costs nothing and it buys the whole picture: the road, the hills and the
// light all agree on a single point straight ahead, and the player is driving
// into it.

/** How far down the road the sunset haze reaches. */
const HAZE_PX = 210;

export interface Sky {
  /** Drifts the cloud bank along, given `px` of road travel. */
  drift(px: number): void;
}

export function createSky(scene: Phaser.Scene): Sky {
  ensureFxTextures(scene);

  scene.add
    .image(WIDTH / 2, HORIZON_Y / 2, ensureSkyTexture(scene))
    .setDisplaySize(WIDTH, HORIZON_Y)
    .setDepth(DEPTH.backdrop);

  // The glare around the sun, wider than it is tall so it washes along the
  // horizon instead of ballooning up into the indigo.
  scene.add
    .image(PERSPECTIVE.centerX, HORIZON_Y - 20, TEX.glow)
    .setDisplaySize(WIDTH * 1.7, SUN_SIZE * 1.4)
    .setTint(PALETTE.sunsetLow)
    .setAlpha(0.5)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);

  // Sunk to a little above its own midline, so what is left standing on the
  // horizon is a wide dome. What cuts it off is the ground plane, drawn over
  // it — the sun is behind the world, not in front of it.
  scene.add
    .image(PERSPECTIVE.centerX, HORIZON_Y - 24, ensureSunTexture(scene))
    .setDepth(DEPTH.backdrop);

  const clouds = scene.add
    .tileSprite(WIDTH / 2, HORIZON_Y * 0.42, WIDTH, HORIZON_Y * 0.84, ensureCloudTexture(scene))
    .setTint(PALETTE.sunsetLow)
    .setAlpha(0.5)
    .setDepth(DEPTH.backdrop);

  // Two ridges, the far one paler and taller and the near one darker: a single
  // ridge reads as a cut-out, and two of them give the sun somewhere to be
  // behind. Both stand on the horizon, where the ground takes over.
  const hills = ensureHillsTexture(scene);
  for (const ridge of [
    { tint: PALETTE.hillFar, height: 74, width: WIDTH * 1.45, x: WIDTH * 0.3, alpha: 0.95 },
    { tint: PALETTE.hillNear, height: 52, width: WIDTH * 1.15, x: WIDTH * 0.66, alpha: 1 },
  ]) {
    scene.add
      .image(ridge.x, HORIZON_Y + 1, hills)
      .setOrigin(0.5, 1)
      .setDisplaySize(ridge.width, ridge.height)
      .setTint(ridge.tint)
      .setAlpha(ridge.alpha)
      .setDepth(DEPTH.backdrop);
  }

  // Haze over the top of the road, above the traffic rather than under it, so
  // a car at the horizon arrives out of the light instead of appearing in
  // front of it.
  scene.add
    .image(WIDTH / 2, HORIZON_Y, TEX.haze)
    .setOrigin(0.5, 0)
    .setDisplaySize(WIDTH, HAZE_PX)
    .setTint(PALETTE.sunsetLow)
    // Enough to swallow the far end of the road and the traffic arriving out
    // of it, not so much that the verge under it turns olive.
    .setAlpha(0.68)
    .setDepth(DEPTH.effects);

  // A last wash of warm light along the bottom of the screen, to keep the near
  // road from reading as a separate, greyer picture from the sky.
  scene.add
    .image(WIDTH / 2, HEIGHT, TEX.glow)
    .setOrigin(0.5, 1)
    .setDisplaySize(WIDTH * 2, 320)
    .setTint(PALETTE.sunsetWarm)
    .setAlpha(0.12)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.effects);

  return {
    drift(px: number): void {
      // A fraction of the road's speed: cloud that kept up with the verge
      // would read as fog a few metres ahead rather than as weather.
      clouds.tilePositionX += px * 0.04;
    },
  };
}
