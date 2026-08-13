import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../../gameConfig';
import { PALETTE, shade } from '../../ui/theme';
import { TEX, ensureGradient } from '../../ui/textures';
import { DEPTH } from '../../ui/widgets';
import {
  LILY_SIZE,
  POND_TEX,
  REED_HEIGHT,
  REED_WIDTH,
  ensureLilyTexture,
  ensureReedTexture,
} from '../../ui/pondTextures';

// The world the holes sit in: a night pond seen from above.
//
// Everything here commits to that one reading. The scene used to hedge —
// bubbles rose through the water, which only makes sense looking sideways
// from below, while the holes had waterlines and lips, which only make sense
// looking down from above. Two viewpoints on screen at once is most of why
// the pond did not cohere.

/** Builds the backdrop. Call once, from the scene's create(). */
export function createPondBackdrop(scene: Phaser.Scene): void {
  // Lit at the top, darkening downward — the moon is up there. Both ends are
  // pulled well down: the holes are the targets, so they have to be the
  // brightest things on screen, and water this dark is what buys them that.
  scene.add
    .image(WIDTH / 2, HEIGHT / 2, ensureGradient(scene, shade(PALETTE.seaDeep, -0.42), shade(PALETTE.seaTop, -0.25)))
    .setDisplaySize(WIDTH, HEIGHT)
    .setDepth(DEPTH.backdrop);

  // The moon's sheen on the surface, and the path it throws down the water.
  // Kept narrow on purpose: spread wide, an additive glow stops reading as a
  // reflection and starts reading as fog.
  scene.add
    .image(WIDTH / 2, HEIGHT * 0.03, TEX.glow)
    .setDisplaySize(WIDTH * 1.15, HEIGHT * 0.17)
    .setTint(PALETTE.moon)
    .setAlpha(0.1)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);
  scene.add
    .image(WIDTH * 0.4, HEIGHT * 0.34, TEX.glow)
    .setDisplaySize(WIDTH * 0.24, HEIGHT * 0.62)
    .setTint(PALETTE.moon)
    .setAlpha(0.035)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);

  ensureLilyTexture(scene);
  ensureReedTexture(scene);
  plantPond(scene);

  // Motes drifting across the surface, replacing the bubbles that used to
  // rise through it. Slow and sideways: this is pollen on water, not air in
  // a tank.
  const drift = scene.add.particles(0, 0, TEX.spark, {
    x: -12,
    y: { min: 0, max: HEIGHT },
    speedX: { min: 5, max: 16 },
    speedY: { min: -3, max: 3 },
    scale: { min: 0.1, max: 0.24 },
    alpha: { start: 0.22, end: 0 },
    lifespan: { min: 12_000, max: 22_000 },
    frequency: 900,
    tint: [PALETTE.moon, PALETTE.cyan],
    blendMode: 'ADD',
  });
  drift.setDepth(DEPTH.backdrop);

  // A wide, very faint ring crossing the water every few seconds, so the
  // surface between the holes is never completely still.
  scene.time.addEvent({
    delay: 2600,
    loop: true,
    callback: () => surfaceRipple(scene),
  });

  // Darkens the water behind the HUD pills so the readouts stay legible.
  scene.add
    .image(WIDTH / 2, 0, TEX.topFade)
    .setOrigin(0.5, 0)
    .setDisplaySize(WIDTH, 190)
    .setAlpha(0.85)
    .setDepth(DEPTH.effects);
}

// Where the pads and reeds go. The holes occupy four bands at y 214-278,
// 366-430, 518-582 and 670-734, and they run nearly the full width — so the
// scenery lives in the gaps between those bands, in the strip under the HUD,
// and in the strip above the level toast. Everything sits below the hole
// rims, so a pad that reaches a hole tucks behind it instead of colliding.
const LILIES: { x: number; y: number; scale: number; angle: number }[] = [
  { x: 44, y: 172, scale: 0.62, angle: 24 },
  { x: 388, y: 158, scale: 0.5, angle: -68 },
  { x: 70, y: 322, scale: 0.78, angle: 132 },
  { x: 356, y: 336, scale: 0.56, angle: -18 },
  { x: 214, y: 474, scale: 0.46, angle: 78 },
  { x: 62, y: 626, scale: 0.68, angle: -114 },
  { x: 372, y: 616, scale: 0.54, angle: 40 },
  { x: 148, y: 782, scale: 0.86, angle: 8 },
];

const REEDS: { x: number; y: number; scale: number; flip: boolean }[] = [
  { x: 22, y: 214, scale: 0.72, flip: false },
  { x: 404, y: 206, scale: 0.62, flip: true },
  { x: 350, y: 824, scale: 0.9, flip: true },
  { x: 40, y: 830, scale: 0.78, flip: false },
];

function plantPond(scene: Phaser.Scene): void {
  for (const reed of REEDS) {
    const clump = scene.add
      .image(reed.x, reed.y, POND_TEX.reeds)
      .setOrigin(0.5, 1)
      .setDisplaySize(REED_WIDTH * reed.scale, REED_HEIGHT * reed.scale)
      .setFlipX(reed.flip)
      .setAlpha(0.85)
      .setDepth(DEPTH.backdrop);
    // Rooted at the base, so the sway pivots where a reed actually bends.
    scene.tweens.add({
      targets: clump,
      angle: { from: -1.6, to: 1.6 },
      duration: Phaser.Math.Between(3800, 5600),
      delay: Phaser.Math.Between(0, 2000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  for (const lily of LILIES) {
    const pad = scene.add
      .image(lily.x, lily.y, POND_TEX.lily)
      .setDisplaySize(LILY_SIZE * lily.scale, LILY_SIZE * lily.scale)
      .setAngle(lily.angle)
      .setDepth(DEPTH.backdrop);
    scene.tweens.add({
      targets: pad,
      y: lily.y + 3,
      angle: lily.angle + 2.5,
      duration: Phaser.Math.Between(4200, 6400),
      delay: Phaser.Math.Between(0, 2400),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

function surfaceRipple(scene: Phaser.Scene): void {
  const ring = scene.add
    .image(Phaser.Math.Between(40, WIDTH - 40), Phaser.Math.Between(140, HEIGHT - 120), TEX.glow)
    .setDisplaySize(40, 18)
    .setTint(PALETTE.moon)
    .setAlpha(0.07)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);
  scene.tweens.add({
    targets: ring,
    displayWidth: 240,
    displayHeight: 96,
    alpha: 0,
    duration: 3200,
    ease: 'Sine.easeOut',
    onComplete: () => ring.destroy(),
  });
}
