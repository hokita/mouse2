import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../../gameConfig';
import { PALETTE, shade } from '../../ui/theme';
import { TEX, ensureGradient } from '../../ui/textures';
import { DEPTH } from '../../ui/widgets';

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
