import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../../gameConfig';
import { PALETTE } from '../../ui/theme';
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
  // Lit at the top, darkening downward — the moon is up there. The old
  // gradient ran the other way and lit the water from underneath.
  scene.add
    .image(WIDTH / 2, HEIGHT / 2, ensureGradient(scene, PALETTE.seaDeep, PALETTE.seaTop))
    .setDisplaySize(WIDTH, HEIGHT)
    .setDepth(DEPTH.backdrop);

  // The moon's sheen on the surface, and the path it throws down the water.
  scene.add
    .image(WIDTH / 2, HEIGHT * 0.06, TEX.glow)
    .setDisplaySize(WIDTH * 1.9, HEIGHT * 0.42)
    .setTint(PALETTE.moon)
    .setAlpha(0.14)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);
  scene.add
    .image(WIDTH * 0.38, HEIGHT * 0.42, TEX.glow)
    .setDisplaySize(WIDTH * 0.42, HEIGHT * 0.8)
    .setTint(PALETTE.moon)
    .setAlpha(0.05)
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
