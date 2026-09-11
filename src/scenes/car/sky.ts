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
import { CAMERA, HORIZON_Y } from './road';

// Everything above the road.
//
// The sun is centred on the vanishing point rather than parked off to one
// side. It costs nothing and it buys the whole picture: the road, the hills
// and the light all agree on a single point straight ahead, and the player is
// driving into it.
//
// On a bend the far end of the road swings sideways and the sky answers by
// swinging the other way, because what is really turning is the car. That
// counter-swing is most of what tells the player a corner is a corner rather
// than a road that has been drawn crooked.

/** How much of the road's swing each layer takes, nearest layer first. */
const CLOUD_SWING = 0.62;
const HILL_SWING = 0.4;
const SUN_SWING = 0.26;

export interface Sky {
  /**
   * Leans the sky to answer a road that has swung `sway` pixels off straight,
   * and drifts the cloud bank on by `metres` of travel.
   */
  update(sway: number, metres: number): void;
}

export function createSky(scene: Phaser.Scene): Sky {
  ensureFxTextures(scene);

  // The ground the road is not covering. It sits over the sky's own layers
  // and under the road, which makes it two things at once: what cuts the sun
  // off at the horizon, and what fills the gap on a downhill, where the far
  // end of the road falls away below eye level. Either way what shows is the
  // haze the road fades into rather than bare canvas.
  scene.add
    .rectangle(WIDTH / 2, (HORIZON_Y + HEIGHT) / 2, WIDTH, HEIGHT - HORIZON_Y, PALETTE.sunsetLow)
    .setDepth(DEPTH.backdrop + 0.5);

  scene.add
    .image(WIDTH / 2, HORIZON_Y / 2, ensureSkyTexture(scene))
    .setDisplaySize(WIDTH, HORIZON_Y)
    .setDepth(DEPTH.backdrop);

  // The glare around the sun, wider than it is tall so it washes along the
  // horizon instead of ballooning up into the indigo.
  const glare = scene.add
    .image(CAMERA.centerX, HORIZON_Y - 20, TEX.glow)
    .setDisplaySize(WIDTH * 1.7, SUN_SIZE * 1.4)
    .setTint(PALETTE.sunsetLow)
    .setAlpha(0.5)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);

  // Sunk to a little above its own midline, so what is left standing on the
  // horizon is a wide dome. What cuts it off is the ground, drawn over it —
  // the sun is behind the world, not in front of it.
  const sun = scene.add
    .image(CAMERA.centerX, HORIZON_Y - 24, ensureSunTexture(scene))
    .setDepth(DEPTH.backdrop);

  const clouds = scene.add
    .tileSprite(WIDTH / 2, HORIZON_Y * 0.42, WIDTH, HORIZON_Y * 0.84, ensureCloudTexture(scene))
    .setTint(PALETTE.sunsetLow)
    .setAlpha(0.5)
    .setDepth(DEPTH.backdrop);

  // Two ridges, the far one paler and taller and the near one darker: a single
  // ridge reads as a cut-out, and two of them give the sun somewhere to be
  // behind. Both are drawn wider than the screen so that leaning them into a
  // bend never walks an end into view.
  const hillsTexture = ensureHillsTexture(scene);
  const ridges = [
    { tint: PALETTE.hillFar, height: 74, width: WIDTH * 2.2, x: WIDTH * 0.3, alpha: 0.95 },
    { tint: PALETTE.hillNear, height: 52, width: WIDTH * 1.9, x: WIDTH * 0.66, alpha: 1 },
  ].map((ridge) => {
    const image = scene.add
      .image(ridge.x, HORIZON_Y + 1, hillsTexture)
      .setOrigin(0.5, 1)
      .setDisplaySize(ridge.width, ridge.height)
      .setTint(ridge.tint)
      .setAlpha(ridge.alpha)
      .setDepth(DEPTH.backdrop);
    return { image, home: ridge.x };
  });

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

  /** Weather, which moves on its own account rather than with the car. */
  let breeze = 0;

  return {
    update(sway: number, metres: number): void {
      // Every layer is placed from the road's current swing rather than nudged
      // along by it, so a run of corners cannot walk the sun off the screen:
      // straighten up and the sky comes back to where it belongs.
      sun.x = CAMERA.centerX - sway * SUN_SWING;
      glare.x = sun.x;
      for (const ridge of ridges) {
        ridge.image.x = ridge.home - sway * HILL_SWING;
      }
      // A tile sprite samples at +tilePosition, so adding moves the cloud
      // bank left — the same way the hills and the sun go.
      breeze += metres * 0.03;
      clouds.tilePositionX = breeze + sway * CLOUD_SWING;
    },
  };
}
