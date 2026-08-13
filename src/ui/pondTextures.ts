import Phaser from 'phaser';
import { PALETTE, shade } from './theme';
import { define, fillPolygon } from './textures';

// Fish Catch's art, kept apart from the shared effects and the other two
// games. It is the largest single set in the project — a pond, its scenery
// and everything that surfaces out of it — and ui/textures.ts was already the
// biggest file here before it grew a world.

export const POND_TEX = {
  back: 'pond-back',
  lip: 'pond-lip',
  trash: 'pond-trash',
  shimmer: 'pond-shimmer',
  lily: 'pond-lily',
  reeds: 'pond-reeds',
  ring: 'pond-ring',
} as const;

export function fishTexture(color: number, rare: boolean): string {
  return `fish-${color.toString(16)}${rare ? '-rare' : ''}`;
}

// As elsewhere, the art is drawn at exactly the size the game tests taps
// against, so a fish can never look bigger or smaller than it is catchable.
export const FISH_WIDTH = 76;
export const FISH_HEIGHT = 52;
export const TRASH_WIDTH = 44;
export const TRASH_HEIGHT = 56;
export const POND_WIDTH = 128;
export const POND_HEIGHT = 64;
/**
 * The canvas the hole is baked on, padded well past the hole itself.
 *
 * The hole stays POND_WIDTH x POND_HEIGHT; the margin is where its contact
 * shadow falls off. Drawn on a canvas the size of the hole, that shadow has
 * nowhere to go and degenerates into a hard step at the texture edge. Sprites
 * are displayed at this padded size, which moves no geometry: the hole is
 * still centred where it always was.
 */
export const POND_TEX_WIDTH = 168;
export const POND_TEX_HEIGHT = 104;

/**
 * A round fish in profile, nose to the right: big eye, fanned tail, a pale
 * belly and a shaded back. `rare` adds the gold trim and glints that mark out
 * the 30-point catch — the shape stays identical so it still reads as a fish
 * at a glance, and only the finish says "this one is special".
 */
export function ensureFishTexture(
  scene: Phaser.Scene,
  color: number,
  options: { rare?: boolean } = {}
): string {
  const rare = options.rare === true;
  return define(scene, fishTexture(color, rare), FISH_WIDTH, FISH_HEIGHT, (g) => {
    const w = FISH_WIDTH;
    const h = FISH_HEIGHT;
    const cx = w * 0.56;
    const cy = h * 0.52;
    const rx = w * 0.35;
    const ry = h * 0.36;

    // Fins and tail first, so the body outline overlaps where they join it.
    fillPolygon(g, [
      [0, h * 0.08],
      [w * 0.32, h * 0.5],
      [0, h * 0.92],
    ], shade(color, -0.3));
    fillPolygon(g, [
      [w * 0.06, h * 0.28],
      [w * 0.3, h * 0.5],
      [w * 0.06, h * 0.72],
    ], shade(color, 0.12));

    fillPolygon(g, [
      [w * 0.38, h * 0.18],
      [w * 0.58, h * -0.04],
      [w * 0.68, h * 0.22],
    ], shade(color, -0.18));
    fillPolygon(g, [
      [w * 0.42, h * 0.84],
      [w * 0.56, h * 1.04],
      [w * 0.66, h * 0.8],
    ], shade(color, -0.18));

    g.fillStyle(color, 1);
    g.fillEllipse(cx, cy, rx * 2, ry * 2);

    // Lit belly, shaded back — the pair is what stops a flat oval from
    // reading as a coloured blob.
    g.fillStyle(0xffffff, 0.2);
    g.fillEllipse(cx, cy + ry * 0.5, rx * 1.5, ry * 0.85);
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(cx, cy - ry * 0.6, rx * 1.6, ry * 0.7);

    // Two soft bands across the flank.
    g.fillStyle(shade(color, -0.3), 0.5);
    g.fillEllipse(cx - rx * 0.42, cy, rx * 0.22, ry * 1.5);
    g.fillEllipse(cx + rx * 0.02, cy, rx * 0.18, ry * 1.75);

    g.lineStyle(2, shade(color, rare ? 0.55 : -0.5), 0.9);
    g.strokeEllipse(cx, cy, rx * 2, ry * 2);

    // Gill line.
    g.lineStyle(2, shade(color, -0.35), 0.7);
    g.beginPath();
    g.arc(cx + rx * 0.9, cy, ry * 0.85, Phaser.Math.DegToRad(120), Phaser.Math.DegToRad(240));
    g.strokePath();

    g.fillStyle(0xffffff, 1);
    g.fillCircle(w * 0.76, h * 0.4, 7);
    g.fillStyle(0x11142b, 1);
    g.fillCircle(w * 0.775, h * 0.42, 3.4);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(w * 0.8, h * 0.37, 1.5);

    // Smile, drawn as the lower arc of a circle just behind the mouth.
    g.lineStyle(2, shade(color, -0.5), 0.8);
    g.beginPath();
    g.arc(w * 0.83, h * 0.55, 5.5, Phaser.Math.DegToRad(35), Phaser.Math.DegToRad(135));
    g.strokePath();

    // Moonlight along the back, and water over the belly. A fish is lifted
    // only 18px out of a hole, so its lowest band is still at the waterline —
    // tinting it toward the pond is what stops the sprite reading as a decal
    // laid on top of the hole.
    g.lineStyle(2, PALETTE.moon, 0.3);
    g.beginPath();
    g.arc(cx, cy, ry * 1.02, Phaser.Math.DegToRad(206), Phaser.Math.DegToRad(334));
    g.strokePath();

    // Confined to the body ellipse. Filled across the full texture width it
    // tints the transparent margin too, which hangs a faint dark box under
    // every fish.
    for (let y = Math.floor(h * 0.72); y < h; y += 1) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = rx * Math.sqrt(1 - dy * dy);
      const depth = (y - h * 0.72) / (h * 0.28);
      g.fillStyle(PALETTE.pondRim, 0.36 * depth);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    if (rare) {
      for (const [x, y, r] of [
        [w * 0.34, h * 0.3, 4],
        [w * 0.5, h * 0.72, 3],
        [w * 0.66, h * 0.24, 2.5],
      ]) {
        // Four-point glint: two crossed slivers read as a sparkle at this
        // size where a star polygon just turns into a dot.
        fillPolygon(g, [
          [x - r, y],
          [x, y - r],
          [x + r, y],
          [x, y + r],
        ], 0xffffff, 0.95);
      }
    }
  });
}

/**
 * A dented tin can — deliberately grey and angular, so it never gets mistaken
 * for a fish in the half-second a player has to decide whether to tap it.
 *
 * Drawn edge to edge of its texture, because that texture is also the tap
 * target. Transparent margin around the art would quietly act as padding, and
 * on the one thing in the game that costs points, padding means docking a
 * player for a tap that visibly missed.
 */
export function ensureTrashTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.trash, TRASH_WIDTH, TRASH_HEIGHT, (g) => {
    const w = TRASH_WIDTH;
    const h = TRASH_HEIGHT;
    const body = 0x6b7490;
    // 1px in from the sides is where the barrel's outline goes, so the art
    // still finishes flush with the texture edge.
    const left = 1;
    const width = w - 2;
    const top = h * 0.12;
    const base = h * 0.9;

    // Base, barrel, then lid, each overlapping the last: three flat shapes
    // stacked in that order is what reads as a cylinder.
    g.fillStyle(shade(body, -0.4), 1);
    g.fillEllipse(w / 2, base, width, h * 0.18);

    g.fillStyle(body, 1);
    g.fillRect(left, top, width, base - top);

    g.fillStyle(shade(body, -0.35), 1);
    g.fillEllipse(w / 2, top + h * 0.05, width, h * 0.2);
    g.fillStyle(shade(body, 0.28), 1);
    g.fillEllipse(w / 2, top, width, h * 0.19);

    // Label, scuffed.
    g.fillStyle(0x39415c, 1);
    g.fillRect(left, h * 0.38, width, h * 0.26);
    g.fillStyle(0x8e9bc6, 0.45);
    g.fillRect(left + 4, h * 0.44, width * 0.42, 2.5);
    g.fillRect(left + 4, h * 0.53, width * 0.6, 2);

    // Crushed down one side, glossy down the other.
    fillPolygon(g, [
      [w - left, h * 0.28],
      [w - left - width * 0.28, h * 0.5],
      [w - left, h * 0.72],
    ], 0x000000, 0.22);
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(left + 4, top, width * 0.12, base - top);

    // Sides are drawn as bars rather than stroked as one outline: a stroke
    // around the whole barrel would straddle the texture edge and be clipped
    // to half its width.
    g.fillStyle(0x232941, 0.9);
    g.fillRect(left, top, 1.5, base - top);
    g.fillRect(w - left - 1.5, top, 1.5, base - top);
    g.lineStyle(2, 0x232941, 0.75);
    g.strokeEllipse(w / 2, top, width, h * 0.19);

    // The same overhead moon, and the same waterline.
    g.lineStyle(1.5, PALETTE.moon, 0.22);
    g.beginPath();
    g.moveTo(left + 3, top + h * 0.08);
    g.lineTo(left + 3, base - 4);
    g.strokePath();

    // Confined to the barrel, and to its rounded base below `base` — a
    // full-width fill would tint the transparent corners around the foot.
    for (let y = Math.floor(h * 0.74); y < h; y += 1) {
      const depth = (y - h * 0.74) / (h * 0.26);
      let x0 = left;
      let x1 = left + width;
      if (y > base) {
        const dy = (y - base) / (h * 0.09);
        if (Math.abs(dy) >= 1) {
          continue;
        }
        const half = (width / 2) * Math.sqrt(1 - dy * dy);
        x0 = w / 2 - half;
        x1 = w / 2 + half;
      }
      g.fillStyle(PALETTE.pondRim, 0.34 * depth);
      g.fillRect(x0, y, x1 - x0, 1);
    }
  });
}

/**
 * Two faint caustic rings, scaled and faded on a slow loop inside each hole.
 *
 * Baked on the same padded canvas as the hole halves so all three stack at
 * one display size, and so the scene's scale tween has a known basis.
 */
export function ensureShimmerTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.shimmer, POND_TEX_WIDTH, POND_TEX_HEIGHT, (g) => {
    const cx = POND_TEX_WIDTH / 2;
    const cy = POND_TEX_HEIGHT / 2;
    g.lineStyle(2.5, PALETTE.moon, 0.5);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.46, POND_HEIGHT * 0.34);
    g.lineStyle(1.5, PALETTE.moon, 0.34);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.24, POND_HEIGHT * 0.18);
  });
}

export const LILY_SIZE = 64;

/**
 * A lily pad: a disc with a wedge cut out of it, rim-lit along its upper
 * edge. The notch is what makes it a lily pad rather than a green dot, and it
 * is drawn as a polygon that returns to the centre rather than cut out of a
 * circle — Graphics has no way to subtract a shape, and filling the notch with
 * a background colour would only work over one exact backdrop.
 */
export function ensureLilyTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.lily, LILY_SIZE, LILY_SIZE, (g) => {
    const c = LILY_SIZE / 2;
    const rx = c - 2;
    // Slightly squashed: a pad lies flat on the water, so it is never a
    // perfect circle from where the player is looking.
    const ry = rx * 0.86;
    const body = shade(PALETTE.grass, -0.5);

    // What it casts on the water beneath it.
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(c, c + ry * 0.2, rx * 1.94, ry * 1.88);

    const steps = 44;
    const notch = Phaser.Math.DegToRad(30);
    const points: number[][] = [[c, c]];
    for (let i = 0; i <= steps; i += 1) {
      const a = notch / 2 + (i / steps) * (Math.PI * 2 - notch);
      points.push([c + Math.cos(a) * rx, c + Math.sin(a) * ry]);
    }
    fillPolygon(g, points, body);

    // Moonlight along the upper edge. Walked as line segments rather than
    // stroked as an arc, because the pad is an ellipse and Graphics has no
    // partial-ellipse stroke.
    g.lineStyle(1.6, PALETTE.moon, 0.24);
    g.beginPath();
    for (let i = 0; i <= 24; i += 1) {
      const a = Math.PI + (i / 24) * Math.PI;
      const x = c + Math.cos(a) * (rx - 1);
      const y = c + Math.sin(a) * (ry - 1);
      if (i === 0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    }
    g.strokePath();

    // Veins, radiating away from the notch.
    g.lineStyle(1, shade(PALETTE.grass, 0.25), 0.16);
    for (const deg of [70, 130, 190, 250, 310]) {
      const a = Phaser.Math.DegToRad(deg);
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * rx * 0.86, c + Math.sin(a) * ry * 0.86);
      g.strokePath();
    }
  });
}

export const REED_WIDTH = 96;
export const REED_HEIGHT = 150;

/**
 * A clump of reeds, rooted at the bottom of its texture. Near-black on
 * purpose: these are silhouettes at the edge of the light, and anything
 * brighter starts competing with the holes for attention.
 */
export function ensureReedTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.reeds, REED_WIDTH, REED_HEIGHT, (g) => {
    const blade = shade(PALETTE.grassDark, -0.2);
    const stalks: { x: number; lean: number; length: number; width: number; head: boolean }[] = [
      { x: 16, lean: -13, length: 96, width: 11, head: false },
      { x: 34, lean: 6, length: 138, width: 10, head: true },
      { x: 50, lean: -5, length: 112, width: 12, head: false },
      { x: 66, lean: 15, length: 132, width: 10, head: true },
      { x: 82, lean: 9, length: 84, width: 11, head: false },
    ];

    for (const stalk of stalks) {
      const tipX = stalk.x + stalk.lean;
      const tipY = REED_HEIGHT - stalk.length;
      // Four points, not three: a blade that tapers to a literal point
      // rasterises to a hairline and reads as a scratch on the water.
      fillPolygon(g, [
        [stalk.x - stalk.width / 2, REED_HEIGHT],
        [stalk.x + stalk.width / 2, REED_HEIGHT],
        [tipX + 1.2, tipY],
        [tipX - 1.2, tipY],
      ], blade);
      if (stalk.head) {
        g.fillStyle(blade, 1);
        g.fillEllipse(tipX, tipY + 16, 11, 34);
      }
      g.lineStyle(1.2, PALETTE.moon, 0.13);
      g.beginPath();
      g.moveTo(stalk.x - stalk.width * 0.28, REED_HEIGHT);
      g.lineTo(tipX - 1, tipY + 5);
      g.strokePath();
    }
  });
}

export const RING_SIZE = 64;

/**
 * An open ring, flattened into perspective. The splash used to be a filled
 * glow scaled up, which the eye reads as a flash rather than as water: the
 * hole in the middle is what makes it a ripple.
 */
export function ensureRingTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.ring, RING_SIZE, RING_SIZE, (g) => {
    const c = RING_SIZE / 2;
    g.lineStyle(5, 0xffffff, 0.85);
    g.strokeEllipse(c, c, RING_SIZE - 10, (RING_SIZE - 10) * 0.56);
    g.lineStyle(2, 0xffffff, 0.3);
    g.strokeEllipse(c, c, RING_SIZE - 22, (RING_SIZE - 22) * 0.56);
  });
}

/**
 * A hole in the pond, drawn in two halves that sandwich whatever comes out of
 * it: `back` is the opening, `lip` is the near rim in front.
 *
 * The lighting is the point. Looking down into a hole, the far wall is what
 * catches the moon and the near opening is what falls away into the dark — so
 * the texture is brightest just under its top rim and darkest at the bottom.
 * Drawn the other way round (a bright near lip, as this used to be) the eye
 * reads a raised lozenge instead of an opening, and twelve of them read as
 * twelve beans floating on the water.
 */
export function ensurePondTextures(scene: Phaser.Scene): void {
  const cx = POND_TEX_WIDTH / 2;
  const cy = POND_TEX_HEIGHT / 2;
  const rimW = 122;
  const rimH = 58;
  const holeW = 112;
  const holeH = 50;
  // The lit wet edge around the opening, and the brightest thing in the
  // texture. This is what carries the illusion: a hole is read from its edge
  // catching light, not from its inside being bright. An interior brighter
  // than the surface it is cut into is the shading of a dome, which is what
  // this used to be.
  const rimColor = shade(PALETTE.pond, -0.42);

  define(scene, POND_TEX.back, POND_TEX_WIDTH, POND_TEX_HEIGHT, (g) => {
    // Contact shadow. It needs the padding to exist at all: squeezed inside
    // the rim's own bounds the fourteen steps land on top of each other and
    // the falloff becomes a hard edge.
    for (let i = 14; i > 0; i -= 1) {
      g.fillStyle(0x000000, 0.035);
      g.fillEllipse(cx, cy + 3, rimW + i * 2.6, rimH + i * 2);
    }

    g.fillStyle(rimColor, 1);
    g.fillEllipse(cx, cy, rimW - 1.5, rimH - 1.5);

    // The opening. Darkest just under the top rim, where the rim itself cuts
    // the moon off, easing only slightly lighter toward the bottom where
    // light reaches the far wall. Every value stays below the water around
    // it, because that is what recessed means.
    const rx = holeW / 2;
    const ry = holeH / 2;
    const shadowed = Phaser.Display.Color.IntegerToColor(0x03101a);
    const farWall = Phaser.Display.Color.IntegerToColor(shade(PALETTE.pondRim, 0.12));
    for (let y = 0; y < POND_TEX_HEIGHT; y += 1) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = rx * Math.sqrt(1 - dy * dy);
      const t = (dy + 1) / 2;
      const lit = Math.pow(t, 1.5);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(shadowed, farWall, 100, Math.round(lit * 100));
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    // The rim's shadow thrown down the inside of the far wall — the single
    // strongest cue that this is an opening. Walked as segments along the
    // ellipse: g.arc draws a circle, so on a 112x50 opening it would cut
    // across the middle instead of hugging the edge.
    for (let pass = 0; pass < 4; pass += 1) {
      g.lineStyle(3, 0x000000, 0.15 - pass * 0.032);
      g.beginPath();
      for (let i = 0; i <= 30; i += 1) {
        const a = Math.PI + (i / 30) * Math.PI;
        const px = cx + Math.cos(a) * (rx - 1 - pass * 2);
        const py = cy + Math.sin(a) * (ry - 1 - pass * 1.1);
        if (i === 0) {
          g.moveTo(px, py);
        } else {
          g.lineTo(px, py);
        }
      }
      g.strokePath();
    }

    // One faint caustic low in the pool, where light that got in would land.
    g.lineStyle(1.5, PALETTE.moon, 0.05);
    g.strokeEllipse(cx, cy + ry * 0.34, holeW * 0.44, holeH * 0.3);
  });

  define(scene, POND_TEX.lip, POND_TEX_WIDTH, POND_TEX_HEIGHT, (g) => {
    // The near rim, in front of whatever surfaced. It starts on the same lit
    // wet edge as the rim behind it and darkens into the backdrop, so the
    // hole keeps one continuous outline and melts into the water at its foot.
    const near = Phaser.Display.Color.IntegerToColor(rimColor);
    const far = Phaser.Display.Color.IntegerToColor(shade(PALETTE.seaTop, -0.25));
    const halfH = rimH / 2;
    for (let y = Math.floor(cy); y < cy + halfH + 1; y += 1) {
      const dy = (y + 0.5 - cy) / halfH;
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = (rimW / 2) * Math.sqrt(1 - dy * dy);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(near, far, 100, Math.round(dy * 100));
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    // The waterline, as contiguous 1px columns whose alpha falls off toward
    // the ends. A single flat ellipse does not do that: at 41:1 it rasterises
    // to a bar with square ends, which is the very seam this replaced.
    const span = rimW * 0.94;
    const left = cx - span / 2;
    for (let x = 0; x < POND_TEX_WIDTH; x += 1) {
      const u = (x + 0.5 - left) / span;
      if (u < 0 || u > 1) {
        continue;
      }
      const fade = Math.sin(Math.PI * u);
      g.fillStyle(PALETTE.moon, 0.1 * Math.pow(fade, 1.2));
      g.fillRect(x, cy - 3.6, 1, 7.2);
      g.fillStyle(PALETTE.moon, 0.34 * Math.pow(fade, 1.6));
      g.fillRect(x, cy - 1.2, 1, 2.4);
    }
  });
}
