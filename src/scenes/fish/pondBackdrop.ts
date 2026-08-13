import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../../gameConfig';
import { PALETTE, shade } from '../../ui/theme';
import { TEX, ensureGradient } from '../../ui/textures';
import { DEPTH } from '../../ui/widgets';
import {
  LILY_SIZE,
  POND_HEIGHT,
  POND_TEX,
  POND_WIDTH,
  REED_HEIGHT,
  REED_WIDTH,
  ensureLilyTexture,
  ensureReedTexture,
  ensureRingTexture,
} from '../../ui/pondTextures';
import { COLUMNS, HOLE_COLUMN_GAP, HOLE_LEFT, HOLE_ROW_GAP, HOLE_TOP, ROWS } from './holeGrid';

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

  ensureReedTexture(scene);
  ensureRingTexture(scene);
  plantPond(scene);

  // Motes drifting across the surface, replacing the bubbles that used to
  // rise through it. Slow and sideways: this is pollen on water, not air in
  // a tank. speedX and lifespan are matched so that even the slowest mote at
  // its shortest life still clears the full canvas width (18_000ms * 14px/s
  // = 252px, well past WIDTH) rather than fading out a third of the way
  // across.
  const drift = scene.add.particles(0, 0, TEX.spark, {
    x: -12,
    y: { min: 0, max: HEIGHT },
    speedX: { min: 14, max: 30 },
    speedY: { min: -3, max: 3 },
    scale: { min: 0.1, max: 0.24 },
    alpha: { start: 0.22, end: 0 },
    lifespan: { min: 18_000, max: 32_000 },
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

// Where the pads and reeds go. The holes sit in ROWS bands centred at
// HOLE_TOP + row * HOLE_ROW_GAP, COLUMNS per row starting at HOLE_LEFT and
// HOLE_COLUMN_GAP apart (see holeGrid.ts) — so the scenery lives in the gaps
// between those bands, in the strip under the HUD, and in the strip above the
// level toast. Everything sits below the hole rims, so a pad that reaches a
// hole tucks behind it instead of colliding.
//
// These coordinates are hand-placed, not derived from the grid constants —
// warnIfSceneryOverlapsHoles() below is what stops a future retune of HOLE_LEFT,
// HOLE_COLUMN_GAP, HOLE_TOP or HOLE_ROW_GAP from silently landing one of
// these on top of a hole instead of beside it.
const LILIES: { x: number; y: number; scale: number; notch: number }[] = [
  { x: 44, y: 172, scale: 1, notch: 24 },
  { x: 388, y: 158, scale: 0.82, notch: -68 },
  { x: 70, y: 322, scale: 1.2, notch: 132 },
  { x: 356, y: 336, scale: 0.9, notch: -18 },
  { x: 214, y: 474, scale: 0.76, notch: 78 },
  { x: 62, y: 626, scale: 1.1, notch: -114 },
  { x: 372, y: 616, scale: 0.88, notch: 40 },
  { x: 148, y: 782, scale: 1.3, notch: 8 },
];

const REEDS: { x: number; y: number; scale: number; flip: boolean }[] = [
  { x: 22, y: 214, scale: 1, flip: false },
  { x: 404, y: 206, scale: 0.86, flip: true },
  { x: 350, y: 824, scale: 1.2, flip: true },
  { x: 40, y: 830, scale: 1.05, flip: false },
];

/**
 * Warns instead of failing silently: if a lily pad or reed clump's hand-
 * placed centre falls inside any hole's footprint, that means the grid moved
 * out from under this scenery and it needs to be replotted.
 */
function warnIfSceneryOverlapsHoles(): void {
  const halfW = POND_WIDTH / 2;
  const halfH = POND_HEIGHT / 2;
  for (const point of [...LILIES, ...REEDS]) {
    for (let row = 0; row < ROWS; row += 1) {
      const holeY = HOLE_TOP + row * HOLE_ROW_GAP;
      for (let col = 0; col < COLUMNS; col += 1) {
        const holeX = HOLE_LEFT + col * HOLE_COLUMN_GAP;
        const dx = (point.x - holeX) / halfW;
        const dy = (point.y - holeY) / halfH;
        if (dx * dx + dy * dy < 1) {
          console.warn(
            `Pond scenery at (${point.x}, ${point.y}) falls inside hole [${col}, ${row}] — the grid moved, replot LILIES/REEDS.`
          );
        }
      }
    }
  }
}

function plantPond(scene: Phaser.Scene): void {
  warnIfSceneryOverlapsHoles();

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
      .image(lily.x, lily.y, ensureLilyTexture(scene, lily.notch))
      .setDisplaySize(LILY_SIZE * lily.scale, LILY_SIZE * lily.scale)
      .setDepth(DEPTH.backdrop);
    // Bobs on y only — the rim light and cast shadow are baked fixed (see
    // ensureLilyTexture), so tweening angle here would rotate a pad away from
    // its own lighting exactly as setAngle used to.
    scene.tweens.add({
      targets: pad,
      y: lily.y + 3,
      duration: Phaser.Math.Between(4200, 6400),
      delay: Phaser.Math.Between(0, 2400),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

function surfaceRipple(scene: Phaser.Scene): void {
  // The ring texture, not TEX.glow's filled blob — see ensureRingTexture: a
  // filled shape scaled up reads as a flash, not as water. Height is 0.44 of
  // width to match the flattening FishScene.expandRing applies to splashes,
  // so the ambient ripple implies the same ground plane as the holes.
  const ring = scene.add
    .image(Phaser.Math.Between(40, WIDTH - 40), Phaser.Math.Between(140, HEIGHT - 120), POND_TEX.ring)
    .setDisplaySize(40, 40 * 0.44)
    .setTint(PALETTE.moon)
    .setAlpha(0.13)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);
  scene.tweens.add({
    targets: ring,
    displayWidth: 240,
    displayHeight: 240 * 0.44,
    alpha: 0,
    duration: 3200,
    ease: 'Sine.easeOut',
    onComplete: () => ring.destroy(),
  });
}
