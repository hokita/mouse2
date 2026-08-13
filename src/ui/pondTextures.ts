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

export function ensurePondTextures(scene: Phaser.Scene): void {
  const cx = POND_WIDTH / 2;
  const cy = POND_HEIGHT / 2;

  define(scene, POND_TEX.back, POND_WIDTH, POND_HEIGHT, (g) => {
    g.fillStyle(PALETTE.pondRim, 1);
    g.fillEllipse(cx, cy, POND_WIDTH, POND_HEIGHT);

    // Filled row by row rather than as one flat ellipse: the water has to go
    // from dark at the far edge to lit at the near one, which is what tells
    // the eye it is a hole rather than a coloured sticker.
    const rx = cx - 5;
    const ry = cy - 4;
    const from = Phaser.Display.Color.IntegerToColor(PALETTE.pondDeep);
    const to = Phaser.Display.Color.IntegerToColor(PALETTE.pond);
    for (let y = 0; y < POND_HEIGHT; y += 1) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = rx * Math.sqrt(1 - dy * dy);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, POND_HEIGHT - 1, y);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    g.lineStyle(2, 0xffffff, 0.1);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.6, POND_HEIGHT * 0.5);
    g.lineStyle(1.5, 0xffffff, 0.07);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.3, POND_HEIGHT * 0.26);
  });

  define(scene, POND_TEX.lip, POND_WIDTH, POND_HEIGHT, (g) => {
    const from = Phaser.Display.Color.IntegerToColor(PALETTE.pond);
    const to = Phaser.Display.Color.IntegerToColor(PALETTE.pondRim);
    for (let y = Math.floor(cy); y < POND_HEIGHT; y += 1) {
      const dy = (y + 0.5 - cy) / cy;
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = cx * Math.sqrt(1 - dy * dy);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, POND_HEIGHT - cy, y - cy);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }
    // The waterline itself, catching the light.
    g.fillStyle(0xffffff, 0.22);
    g.fillRect(6, cy - 1, POND_WIDTH - 12, 2);
  });
}
