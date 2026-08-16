import Phaser from 'phaser';
import { PALETTE, shade } from './theme';
import { define, fillPolygon } from './textures';

// Reel Rush's art: a rowboat on the night waterline and everything that hangs
// or drifts below it. Kept apart from the pond set the same way the pond is
// kept apart from the road — each world's sprites live with that world.

export const REEL_TEX = {
  boat: 'reel-boat',
  hook: 'reel-hook',
  boot: 'reel-boot',
  bubble: 'reel-bubble',
  ray: 'reel-ray',
} as const;

export const BOAT_WIDTH = 140;
export const BOAT_HEIGHT = 84;

/**
 * Where the rod tip sits relative to the boat sprite's centre. The scene
 * anchors the fishing line here every frame, so these must stay in step with
 * the rod drawn in ensureBoatTexture — negate X when the boat is flipped.
 */
export const ROD_TIP_X = 56;
export const ROD_TIP_Y = -36;

/**
 * A rowboat in profile with an angler and a rod reaching out over the bow.
 *
 * The palette leans on the project's surface blues rather than daylight wood:
 * everything on this screen is lit by the same overhead moon as the pond, and
 * a brown boat under that moon would read as the one object lit by some other
 * sun. The angler is a plain silhouette — at 140px any face would be four
 * smudged pixels, and a shape the player completes themselves ages better.
 */
export function ensureBoatTexture(scene: Phaser.Scene): string {
  return define(scene, REEL_TEX.boat, BOAT_WIDTH, BOAT_HEIGHT, (g) => {
    const hull = shade(PALETTE.surfaceEdge, -0.25);

    // Hull: a shallow trapezoid, then planking lines, then the gunwale strip.
    fillPolygon(g, [
      [6, 52],
      [134, 52],
      [112, 76],
      [28, 76],
    ], hull);
    g.lineStyle(1.5, shade(hull, -0.35), 0.9);
    g.beginPath();
    g.moveTo(16, 60);
    g.lineTo(124, 60);
    g.moveTo(24, 68);
    g.lineTo(116, 68);
    g.strokePath();

    // The gunwale carries the game's accent, the same way the player car
    // carries Car Racer's — it is what makes the boat this game's boat.
    g.fillStyle(PALETTE.violet, 0.85);
    g.fillRect(6, 50, 128, 4);
    // Moonlight along the top edge, agreeing with every other rim light.
    g.fillStyle(PALETTE.moon, 0.4);
    g.fillRect(6, 50, 128, 1.5);

    // The angler, seated amidships: back, head, and a knit cap.
    const body = 0x11142b;
    g.fillStyle(body, 1);
    g.fillEllipse(52, 42, 30, 26);
    g.fillCircle(58, 24, 8);
    g.fillStyle(shade(PALETTE.violet, -0.35), 1);
    g.fillEllipse(58, 19, 15, 8);
    // Moon rim on the head and shoulders, so the silhouette has a far side.
    g.lineStyle(1.5, PALETTE.moon, 0.35);
    g.beginPath();
    g.arc(58, 24, 8, Phaser.Math.DegToRad(-100), Phaser.Math.DegToRad(20));
    g.strokePath();

    // The rod, in two segments so it reads as flexed under the line's weight.
    // Its tip is the (ROD_TIP_X, ROD_TIP_Y) the scene ties the line to.
    g.lineStyle(3, 0x39415c, 1);
    g.beginPath();
    g.moveTo(60, 34);
    g.lineTo(100, 15);
    g.strokePath();
    g.lineStyle(2, 0x39415c, 1);
    g.beginPath();
    g.moveTo(100, 15);
    g.lineTo(126, 6);
    g.strokePath();
    g.lineStyle(1, PALETTE.moon, 0.5);
    g.beginPath();
    g.moveTo(61, 32.5);
    g.lineTo(125, 5.5);
    g.strokePath();
  });
}

export const HOOK_WIDTH = 30;
export const HOOK_HEIGHT = 40;

/**
 * A J-hook: eye, shank, bend, barb. Struck twice — a dark pass a pixel wide
 * of the bright one — because a single light stroke over dark water loses its
 * edge and reads as a scratch on the screen rather than a thing in the scene.
 */
export function ensureHookTexture(scene: Phaser.Scene): string {
  return define(scene, REEL_TEX.hook, HOOK_WIDTH, HOOK_HEIGHT, (g) => {
    const steel = 0xd7e0f5;
    const dark = 0x39415c;

    const strokeHook = (width: number, color: number, alpha: number): void => {
      g.lineStyle(width, color, alpha);
      // Shank.
      g.beginPath();
      g.moveTo(19, 9);
      g.lineTo(19, 25);
      g.strokePath();
      // Bend, swept through the bottom of the J.
      g.beginPath();
      g.arc(12, 25, 7, 0, Math.PI);
      g.strokePath();
      // Point, rising back up the open side.
      g.beginPath();
      g.moveTo(5, 25);
      g.lineTo(5, 16);
      g.strokePath();
    };

    strokeHook(5, dark, 1);
    strokeHook(3, steel, 1);

    // Eye at the top of the shank, where the line ties on.
    g.lineStyle(4.5, dark, 1);
    g.strokeCircle(19, 6, 3.5);
    g.lineStyle(2.5, steel, 1);
    g.strokeCircle(19, 6, 3.5);

    // Barb.
    fillPolygon(g, [
      [3, 16],
      [7, 16],
      [5, 10],
    ], steel);

    // One glint on the bend — the moon finding the metal.
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(15, 31, 1.6);
  });
}

export const BOOT_WIDTH = 48;
export const BOOT_HEIGHT = 54;

/**
 * The classic haul of a bad cast: an old boot. Grey-violet and slumped where
 * the fish are bright and darting, so the half second the player has to
 * judge it is enough — the same contract Fish Catch's tin can keeps.
 */
export function ensureBootTexture(scene: Phaser.Scene): string {
  return define(scene, REEL_TEX.boot, BOOT_WIDTH, BOOT_HEIGHT, (g) => {
    const leather = 0x5f5872;

    // Shaft, sagging open at the top.
    fillPolygon(g, [
      [16, 6],
      [36, 4],
      [38, 34],
      [14, 34],
    ], leather);
    g.fillStyle(shade(leather, -0.4), 1);
    g.fillEllipse(26, 6, 20, 7);

    // Foot, toe to the left, then the sole under it all.
    g.fillStyle(leather, 1);
    g.fillEllipse(16, 40, 28, 20);
    g.fillRect(14, 30, 24, 16);
    g.fillStyle(0x232941, 1);
    g.fillRoundedRect(2, 44, 42, 8, 4);

    // Laces — two worn crosses.
    g.lineStyle(1.5, shade(leather, 0.35), 0.8);
    g.beginPath();
    g.moveTo(18, 14);
    g.lineTo(32, 20);
    g.moveTo(32, 14);
    g.lineTo(18, 20);
    g.moveTo(18, 24);
    g.lineTo(32, 30);
    g.moveTo(32, 24);
    g.lineTo(18, 30);
    g.strokePath();

    // A scuffed patch on the toe, and the moon down the shaft's near edge.
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(10, 40, 12, 8);
    g.lineStyle(1.5, PALETTE.moon, 0.25);
    g.beginPath();
    g.moveTo(16, 8);
    g.lineTo(15, 32);
    g.strokePath();
  });
}

export const BUBBLE_SIZE = 14;

/** A ring with one glint: air, not a dot of paint. Tinted at the use site. */
export function ensureBubbleTexture(scene: Phaser.Scene): string {
  return define(scene, REEL_TEX.bubble, BUBBLE_SIZE, BUBBLE_SIZE, (g) => {
    const c = BUBBLE_SIZE / 2;
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(c, c, c - 2);
    g.lineStyle(1.5, 0xffffff, 0.8);
    g.strokeCircle(c, c, c - 2);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(c - 2, c - 2, 1.3);
  });
}

export const RAY_WIDTH = 96;
export const RAY_HEIGHT = 256;

/**
 * A shaft of moonlight, brightest where it enters at the top and gone by the
 * bottom, spreading slightly as it falls. Drawn as rows so both the fade and
 * the spread are continuous — a tapered polygon with one alpha reads as a
 * solid glass wedge stood in the water.
 */
export function ensureRayTexture(scene: Phaser.Scene): string {
  return define(scene, REEL_TEX.ray, RAY_WIDTH, RAY_HEIGHT, (g) => {
    const cx = RAY_WIDTH / 2;
    for (let y = 0; y < RAY_HEIGHT; y += 1) {
      const t = y / (RAY_HEIGHT - 1);
      const half = 22 + t * 22;
      const alpha = Math.pow(1 - t, 1.6) * 0.5;
      g.fillStyle(0xffffff, alpha);
      g.fillRect(cx - half, y, half * 2, 1);
    }
  });
}
