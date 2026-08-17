import Phaser from 'phaser';
import { PALETTE, shade } from './theme';
import { define, fillPolygon } from './textures';

// Big Bite's art: a rowboat on the night waterline and the tackle that hangs
// off it. Kept apart from the pond set the same way the pond is kept apart
// from the road — each world's sprites live with that world.

export const REEL_TEX = {
  boat: 'reel-boat',
  bobber: 'reel-bobber',
  bubble: 'reel-bubble',
  ray: 'reel-ray',
  hook: 'reel-hook',
  markFish: 'reel-mark-fish',
  markBoat: 'reel-mark-boat',
} as const;

export const BOAT_WIDTH = 140;
export const BOAT_HEIGHT = 84;

/**
 * Where the rod tip sits relative to the boat sprite's centre. The scene
 * anchors the fishing line here every frame, so these must stay in step with
 * the rod drawn in ensureBoatTexture — negate X when the boat is flipped.
 *
 * These stay in the sprite's own frame: the scene rotates the offset by the
 * hull's angle before using it, because Big Bite leans the boat under load.
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

export const BOBBER_WIDTH = 26;
export const BOBBER_HEIGHT = 36;

/**
 * A classic float: red cap over a pale belly, a stem with a line-ring on
 * top. Read at a glance from its two-tone ball — the one silhouette every
 * player already knows means "watch this".
 */
export function ensureBobberTexture(scene: Phaser.Scene): string {
  return define(scene, REEL_TEX.bobber, BOBBER_WIDTH, BOBBER_HEIGHT, (g) => {
    const cx = BOBBER_WIDTH / 2;
    const ballY = 21;
    const r = 11;
    const red = 0xe8484f;
    const belly = 0xf3ead9;

    // Stem and the ring the line ties to.
    g.fillStyle(0x39415c, 1);
    g.fillRect(cx - 1.5, 3, 3, 8);
    g.lineStyle(2, 0xd7e0f5, 1);
    g.strokeCircle(cx, 3.5, 2.5);

    // Belly first, cap over its top half, so the seam is one clean arc.
    g.fillStyle(belly, 1);
    g.fillCircle(cx, ballY, r);
    g.fillStyle(red, 1);
    g.beginPath();
    g.arc(cx, ballY, r, Math.PI, 0, false);
    g.fillPath();
    g.fillRect(cx - r, ballY - 3, r * 2, 3);

    g.lineStyle(1.5, shade(red, -0.45), 0.9);
    g.strokeCircle(cx, ballY, r);

    // The moon on the cap, and the water's tint under the belly.
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(cx - 4, ballY - 5.5, 5, 3.5);
    g.fillStyle(PALETTE.pondRim, 0.25);
    g.fillEllipse(cx, ballY + r * 0.62, r * 1.4, r * 0.7);
  });
}

export const HOOK_WIDTH = 18;
export const HOOK_HEIGHT = 26;

/**
 * The baited hook the school is watching: a steel J with a worm of bait on
 * the bend. The bait is the bright part on purpose — underwater at night it
 * is the lure the player and the fish are both looking at.
 */
export function ensureHookTexture(scene: Phaser.Scene): string {
  return define(scene, REEL_TEX.hook, HOOK_WIDTH, HOOK_HEIGHT, (g) => {
    const shankX = 11;
    // Eye, shank, then the bend swinging left and up into the point.
    g.lineStyle(2, 0xd7e0f5, 0.95);
    g.strokeCircle(shankX, 3, 2);
    g.beginPath();
    g.moveTo(shankX, 5);
    g.lineTo(shankX, 14);
    g.strokePath();
    g.beginPath();
    g.arc(shankX - 4.5, 14, 4.5, 0, Math.PI * 0.9, false);
    g.strokePath();
    g.beginPath();
    g.moveTo(shankX - 8.6, 15.5);
    g.lineTo(shankX - 7, 10);
    g.strokePath();

    // The bait: a warm blob riding the bend, with one moonlit glint.
    g.fillStyle(PALETTE.rose, 1);
    g.fillEllipse(shankX - 4, 18.5, 9, 7);
    g.fillStyle(shade(PALETTE.rose, -0.35), 1);
    g.fillEllipse(shankX - 1.5, 20, 4.5, 3.5);
    g.fillStyle(0xffffff, 0.6);
    g.fillEllipse(shankX - 6, 16.5, 3, 2);
  });
}

export const MARK_FISH_WIDTH = 26;
export const MARK_FISH_HEIGHT = 16;
export const MARK_BOAT_WIDTH = 34;
export const MARK_BOAT_HEIGHT = 22;

/**
 * The fight panel's two marks, at glyph size. The panel has to say everything
 * it says in pictures — the players it is for cannot read a word of it — so
 * the haul is drawn as the fish and the boat it is being brought home to,
 * rather than as a bar with a name on it. White, for the scene to tint: the
 * fish takes the hooked fish's own rarity colour, so the shape crossing the
 * panel is recognisably the shape thrashing in the water above it.
 */
export function ensureMarkTextures(scene: Phaser.Scene): void {
  define(scene, REEL_TEX.markFish, MARK_FISH_WIDTH, MARK_FISH_HEIGHT, (g) => {
    // Nose left, tail right: it is swimming home, not away.
    fillPolygon(g, [
      [19, 8],
      [26, 2],
      [26, 14],
    ], 0xffffff);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(11, 8, 20, 12);
    // The eye is the one mark that does not take the tint, which is most of
    // what keeps this a fish rather than a blob at 26px.
    g.fillStyle(0x0b0f22, 1);
    g.fillCircle(6, 6.5, 1.6);
  });

  define(scene, REEL_TEX.markBoat, MARK_BOAT_WIDTH, MARK_BOAT_HEIGHT, (g) => {
    // A shallow hull with a raked bow. Drawn flat rather than deep: a deep
    // one at this size stops being a boat and becomes a bowl.
    fillPolygon(g, [
      [1, 14],
      [33, 14],
      [27, 20],
      [6, 20],
    ], 0xffffff);
    g.fillStyle(0xffffff, 1);
    g.fillRect(1, 12, 32, 2.5);
    // The rod and the line hanging off it. The line is what settles it: a
    // hull with a stick could be anything, a hull with a stick and something
    // dangling into the water is a fishing boat.
    g.lineStyle(1.6, 0xffffff, 0.95);
    g.beginPath();
    g.moveTo(12, 11);
    g.lineTo(31, 2);
    g.strokePath();
    g.lineStyle(1, 0xffffff, 0.7);
    g.beginPath();
    g.moveTo(31, 2);
    g.lineTo(31, 11);
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
