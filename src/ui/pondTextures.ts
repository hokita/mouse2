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
  });
}

/** Two faint caustic rings, scaled and faded on a slow loop inside each hole. */
export function ensureShimmerTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.shimmer, POND_WIDTH, POND_HEIGHT, (g) => {
    const cx = POND_WIDTH / 2;
    const cy = POND_HEIGHT / 2;
    g.lineStyle(2.5, PALETTE.moon, 0.5);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.46, POND_HEIGHT * 0.34);
    g.lineStyle(1.5, PALETTE.moon, 0.34);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.24, POND_HEIGHT * 0.18);
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
  const cx = POND_WIDTH / 2;
  const cy = POND_HEIGHT / 2;
  // The hole is inset from the texture edge so there is room to lay a shadow
  // and a wet rim around it without growing the texture — and so the sprite
  // still measures exactly POND_WIDTH x POND_HEIGHT at the use site.
  const rimW = 122;
  const rimH = 58;
  const holeW = 112;
  const holeH = 50;
  const rimColor = shade(PALETTE.seaDeep, 0.16);

  define(scene, POND_TEX.back, POND_WIDTH, POND_HEIGHT, (g) => {
    // Contact shadow, stacked outward from the rim so it falls off smoothly.
    for (let i = 6; i > 0; i -= 1) {
      g.fillStyle(0x000000, 0.05);
      g.fillEllipse(cx, cy + 2, rimW + i * 2.4, rimH + i * 1.8);
    }

    // The wet rim: the pond surface immediately around the opening, lifted a
    // little out of the backdrop so the hole sits *in* something.
    // Drawn a shade smaller than the lip's own ellipse. fillEllipse
    // antialiases its edge while the lip covers the lower half with
    // hard-edged scanlines, so a rim at the full size leaves a fringe of
    // itself showing under every hole.
    g.fillStyle(rimColor, 1);
    g.fillEllipse(cx, cy, rimW - 1.5, rimH - 1.5);

    // The opening, filled row by row. Brightness peaks just below the top
    // rim — the sliver above that peak is the rim's own shadow, and without
    // it the lit far wall runs straight into the rim and the two merge.
    const rx = holeW / 2;
    const ry = holeH / 2;
    const deep = Phaser.Display.Color.IntegerToColor(PALETTE.pondRim);
    const wall = Phaser.Display.Color.IntegerToColor(PALETTE.pond);
    for (let y = 0; y < POND_HEIGHT; y += 1) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = rx * Math.sqrt(1 - dy * dy);
      const t = (dy + 1) / 2;
      const brightness = Math.pow(1 - t, 1.6) * (0.35 + 0.65 * Math.min(t / 0.14, 1));
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(deep, wall, 100, Math.round(brightness * 100));
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    // A specular crescent high on the inner wall, where the moon lands.
    g.lineStyle(2.5, PALETTE.moon, 0.16);
    g.beginPath();
    g.arc(cx, cy, ry * 0.86, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335));
    g.strokePath();

    // Caustics, kept to the lit half where light could plausibly reach.
    g.lineStyle(1.5, 0xffffff, 0.07);
    g.strokeEllipse(cx, cy - 3, holeW * 0.54, holeH * 0.42);
    g.lineStyle(1, 0xffffff, 0.05);
    g.strokeEllipse(cx, cy - 5, holeW * 0.28, holeH * 0.22);
  });

  define(scene, POND_TEX.lip, POND_WIDTH, POND_HEIGHT, (g) => {
    // The near rim: the water surface in front of the opening. It runs from a
    // lit waterline down to the backdrop's own colour, so the hole melts into
    // the pond at its bottom edge instead of ending on a flat plate.
    const near = Phaser.Display.Color.IntegerToColor(shade(PALETTE.pondRim, 0.12));
    const far = Phaser.Display.Color.IntegerToColor(PALETTE.seaTop);
    for (let y = Math.floor(cy); y < POND_HEIGHT; y += 1) {
      const dy = (y + 0.5 - cy) / (rimH / 2);
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = (rimW / 2) * Math.sqrt(1 - dy * dy);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(near, far, 100, Math.round(dy * 100));
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    // The waterline, drawn as a thin lens rather than a row of bars: an
    // ellipse this flat tapers off at its own ends, where a run of rects
    // leaves a dotted seam and a stair-stepped bow.
    g.fillStyle(PALETTE.moon, 0.1);
    g.fillEllipse(cx, cy, rimW * 0.96, 7);
    g.fillStyle(PALETTE.moon, 0.3);
    g.fillEllipse(cx, cy, rimW * 0.88, 2.6);
  });
}
