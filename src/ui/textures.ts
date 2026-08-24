import Phaser from 'phaser';
import { SHARD_HEIGHT, SHARD_WIDTH } from '../core/field';
import { BOSS_HEIGHT, BOSS_WIDTH } from '../core/boss';
import { PALETTE, shade } from './theme';

// Every sprite in the project is drawn here, once, into a canvas texture at
// boot rather than shipped as an image asset. It keeps the repo asset-free
// while still giving the games real artwork instead of flat rectangles, and
// the results are ordinary textures — so they scale, tint and batch exactly
// like loaded PNGs would.
//
// Tiling textures (grass, asphalt, lane dashes, kerbs, stars) are all
// power-of-two sized: TileSprite needs a POT texture to use hardware repeat
// under WebGL, and a non-POT one silently costs an extra canvas copy.

export const TEX = {
  glow: 'fx-glow',
  spark: 'fx-spark',
  starsNear: 'fx-stars-near',
  starsFar: 'fx-stars-far',
  topFade: 'fx-top-fade',
  beam: 'fx-beam',
  ship: 'dodger-ship',
  boss: 'dodger-boss',
  grass: 'road-grass',
  asphalt: 'road-asphalt',
  laneDash: 'road-lane-dash',
  kerb: 'road-kerb',
} as const;

export function shardTexture(color: number): string {
  return `dodger-shard-${color.toString(16)}`;
}

export function carTexture(color: number): string {
  return `car-${color.toString(16)}`;
}

export function gradientTexture(top: number, bottom: number): string {
  return `bg-${top.toString(16)}-${bottom.toString(16)}`;
}

type Draw = (g: Phaser.GameObjects.Graphics) => void;

/**
 * Draws `key` once and caches it. Textures live on the game-wide manager, so
 * re-entering a scene (or visiting a second one that wants the same art)
 * reuses whatever the first visit generated.
 */
export function define(scene: Phaser.Scene, key: string, width: number, height: number, draw: Draw): string {
  if (scene.textures.exists(key)) {
    return key;
  }
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
  return key;
}

export function fillPolygon(g: Phaser.GameObjects.Graphics, points: number[][], color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillPoints(
    points.map(([x, y]) => new Phaser.Geom.Point(x, y)),
    true
  );
}

/** Pulls `points` toward `(cx, cy)` — used to inset a highlight facet. */
function inset(points: number[][], cx: number, cy: number, factor: number): number[][] {
  return points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

// --- shared effects -------------------------------------------------------

/** Soft white blob, built from stacked circles. Tint it at the use site. */
export function ensureFxTextures(scene: Phaser.Scene): void {
  define(scene, TEX.glow, 64, 64, (g) => {
    const steps = 26;
    for (let i = steps; i > 0; i -= 1) {
      g.fillStyle(0xffffff, 0.05);
      g.fillCircle(32, 32, (i / steps) * 31);
    }
  });

  define(scene, TEX.spark, 12, 12, (g) => {
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(6, 6, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 3);
  });

  // Opaque at the top, transparent at the bottom: stretched across the top of
  // a scene it gives obstacles somewhere to emerge from instead of popping in
  // at a hard screen edge. The falloff is curved rather than linear because a
  // straight ramp still has a kink in its slope where it hits zero, and the
  // eye picks that up as a hard line across the screen.
  define(scene, TEX.topFade, 4, 256, (g) => {
    for (let i = 0; i < 256; i += 1) {
      g.fillStyle(0x000000, Math.pow(1 - i / 255, 3));
      g.fillRect(0, i, 4, 1);
    }
  });
}

/**
 * A headlight cone: narrow and bright where it leaves the car (the bottom of
 * the texture), spreading and fading into the distance. Each row is drawn as
 * three nested translucent bars, which is what softens the edges of the beam
 * instead of leaving it a hard-edged triangle.
 */
export function ensureBeamTexture(scene: Phaser.Scene): string {
  return define(scene, TEX.beam, 128, 256, (g) => {
    const layers = 9;
    for (let i = 0; i < 256; i += 1) {
      const nearness = i / 255;
      const halfWidth = 12 + (1 - nearness) * 50;
      const falloff = Math.pow(nearness, 1.6);
      for (let layer = 0; layer < layers; layer += 1) {
        const half = halfWidth * (1 - (layer / layers) * 0.88);
        g.fillStyle(0xffffff, falloff * 0.06);
        g.fillRect(64 - half, i, half * 2, 1);
      }
    }
  });
}

export function ensureGradient(scene: Phaser.Scene, top: number, bottom: number): string {
  const key = gradientTexture(top, bottom);
  const steps = 256;
  return define(scene, key, 4, steps, (g) => {
    const from = Phaser.Display.Color.IntegerToColor(top);
    const to = Phaser.Display.Color.IntegerToColor(bottom);
    for (let i = 0; i < steps; i += 1) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, steps - 1, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, i, 4, 1);
    }
  });
}

export function ensureStarTextures(scene: Phaser.Scene): void {
  const layers = [
    { key: TEX.starsFar, count: 90, maxRadius: 1.1, brightness: 0.45 },
    { key: TEX.starsNear, count: 34, maxRadius: 1.9, brightness: 0.95 },
  ];

  for (const { key, count, maxRadius, brightness } of layers) {
    define(scene, key, 256, 256, (g) => {
      for (let i = 0; i < count; i += 1) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 0.5 + Math.random() * maxRadius;
        const tint = Math.random() < 0.2 ? PALETTE.cyan : Math.random() < 0.2 ? PALETTE.violet : 0xffffff;
        g.fillStyle(tint, brightness * (0.4 + Math.random() * 0.6));
        g.fillCircle(x, y, r);
      }
    });
  }
}

// --- Dodger ---------------------------------------------------------------

// Sprite dimensions are exported from here because they are also the games'
// collision boxes. Art and hitbox share one definition so a redraw can never
// quietly make a sprite lie about how much space it takes up.
export const SHIP_SIZE = 40;
// The shard's size lives in core/field with the rest of the Dodger tuning, so
// the tests that guard the field's difficulty can read it without importing
// Phaser. Re-exported here so texture consumers still have one import.
export { SHARD_WIDTH, SHARD_HEIGHT };

/**
 * A swept-wing shuttle drawn to fill its whole 40x40 collision box — the art
 * and the hitbox are deliberately the same size, so nothing ever kills the
 * player through empty pixels.
 */
export function ensureShipTexture(scene: Phaser.Scene): string {
  return define(scene, TEX.ship, SHIP_SIZE, SHIP_SIZE, (g) => {
    const hull: number[][] = [
      [20, 0],
      [27, 14],
      [40, 34],
      [33, 40],
      [20, 32],
      [7, 40],
      [0, 34],
      [13, 14],
    ];

    fillPolygon(g, hull, shade(PALETTE.cyan, -0.55));
    fillPolygon(g, inset(hull, 20, 22, 0.88), PALETTE.cyan);
    fillPolygon(g, inset(hull, 20, 18, 0.5), shade(PALETTE.cyan, 0.35));

    // Cockpit.
    g.fillStyle(0xffffff, 0.92);
    g.fillEllipse(20, 15, 9, 12);
    g.fillStyle(PALETTE.violet, 0.55);
    g.fillEllipse(20, 16, 6, 8);

    // Engine nozzles.
    g.fillStyle(shade(PALETTE.cyan, 0.6), 1);
    g.fillRect(14, 30, 4, 5);
    g.fillRect(22, 30, 4, 5);
  });
}

/** Hazard crystal, sized to exactly fill the obstacle's collision box. */
export function ensureShardTexture(scene: Phaser.Scene, color: number): string {
  return define(scene, shardTexture(color), SHARD_WIDTH, SHARD_HEIGHT, (g) => {
    const w = SHARD_WIDTH;
    const h = SHARD_HEIGHT;
    const body: number[][] = [
      [w * 0.5, 0],
      [w, h * 0.3],
      [w * 0.86, h * 0.94],
      [w * 0.5, h],
      [w * 0.14, h * 0.94],
      [0, h * 0.3],
    ];

    fillPolygon(g, body, color);
    // Left facet catches the light, right facet falls into shadow — enough to
    // read as a solid object rather than a coloured silhouette.
    fillPolygon(g, [body[0], body[4], body[5]], 0xffffff, 0.22);
    fillPolygon(g, [body[0], body[1], body[2], [w * 0.5, h]], 0x000000, 0.22);

    g.lineStyle(2, shade(color, 0.45), 0.9);
    g.strokePoints(
      body.map(([x, y]) => new Phaser.Geom.Point(x, y)),
      true
    );

    g.fillStyle(0xffffff, 0.75);
    g.fillCircle(w * 0.5, h * 0.28, 2.2);
  });
}

/**
 * The final boss's hull, drawn at exactly its collision box's size as the
 * ship and the shards are.
 *
 * Deliberately the shard's silhouette inverted and widened: it reads as the
 * same family of threat, one rank up, rather than as a creature from another
 * game. Plated in a darkened rose so the phase tints (which brighten toward
 * white) have somewhere to travel.
 */
export function ensureBossTexture(scene: Phaser.Scene): string {
  return define(scene, TEX.boss, BOSS_WIDTH, BOSS_HEIGHT, (g) => {
    const w = BOSS_WIDTH;
    const h = BOSS_HEIGHT;
    const base = shade(PALETTE.rose, -0.35);

    // Wide, blunt wedge pointing down at the player.
    const body: number[][] = [
      [w * 0.08, 0],
      [w * 0.92, 0],
      [w, h * 0.38],
      [w * 0.72, h * 0.88],
      [w * 0.5, h],
      [w * 0.28, h * 0.88],
      [0, h * 0.38],
    ];

    fillPolygon(g, body, base);

    // Armour plating: three bands across the hull, alternating light and
    // shadow, so the body reads as solid rather than as a flat silhouette.
    fillPolygon(g, [[w * 0.08, 0], [w * 0.92, 0], [w * 0.86, h * 0.22], [w * 0.14, h * 0.22]], 0xffffff, 0.16);
    fillPolygon(g, [[w * 0.14, h * 0.22], [w * 0.86, h * 0.22], [w * 0.8, h * 0.5], [w * 0.2, h * 0.5]], 0x000000, 0.18);

    // The core, and the two gun ports the fans come out of.
    g.fillStyle(shade(PALETTE.rose, 0.5), 1);
    g.fillCircle(w * 0.5, h * 0.52, h * 0.16);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(w * 0.5, h * 0.52, h * 0.07);

    g.fillStyle(shade(PALETTE.amber, -0.1), 1);
    g.fillRect(w * 0.26, h * 0.62, w * 0.08, h * 0.14);
    g.fillRect(w * 0.66, h * 0.62, w * 0.08, h * 0.14);

    g.lineStyle(3, shade(PALETTE.rose, 0.25), 0.9);
    g.strokePoints(
      body.map(([x, y]) => new Phaser.Geom.Point(x, y)),
      true
    );
  });
}

// --- Car Racer ------------------------------------------------------------

export const CAR_WIDTH = 44;
export const CAR_HEIGHT = 76;

/**
 * Top-down car, nose pointing up the screen: windscreen and headlights at the
 * top, rear window and tail lights at the bottom. Drawn at exactly the
 * collision box's size for the same reason the ship is.
 */
export function ensureCarTexture(
  scene: Phaser.Scene,
  color: number,
  options: { stripe?: boolean } = {}
): string {
  return define(scene, carTexture(color), CAR_WIDTH, CAR_HEIGHT, (g) => {
    const w = CAR_WIDTH;
    const h = CAR_HEIGHT;
    const bodyRadius = w * 0.27;

    // Mirrors first, so the body outline overlaps their inner edge.
    g.fillStyle(shade(color, -0.3), 1);
    g.fillRoundedRect(0, h * 0.3, w * 0.12, h * 0.08, 2);
    g.fillRoundedRect(w * 0.88, h * 0.3, w * 0.12, h * 0.08, 2);

    g.fillStyle(color, 1);
    g.fillRoundedRect(2, 2, w - 4, h - 4, bodyRadius);

    // Rear half sits in shadow; a gloss strip runs down the left flank.
    g.fillStyle(shade(color, -0.28), 0.55);
    g.fillRoundedRect(2, h * 0.55, w - 4, h * 0.45 - 2, {
      tl: 0,
      tr: 0,
      bl: bodyRadius,
      br: bodyRadius,
    });
    g.fillStyle(0xffffff, 0.13);
    g.fillRoundedRect(w * 0.13, h * 0.09, w * 0.16, h * 0.8, w * 0.08);

    if (options.stripe) {
      g.fillStyle(0xffffff, 0.32);
      g.fillRect(w * 0.44, 4, w * 0.05, h - 8);
      g.fillRect(w * 0.53, 4, w * 0.05, h - 8);
    }

    // Cabin.
    g.fillStyle(0x0e1120, 0.9);
    g.fillRoundedRect(w * 0.14, h * 0.24, w * 0.72, h * 0.47, w * 0.16);
    g.fillStyle(0x9fdcff, 0.88);
    g.fillRoundedRect(w * 0.19, h * 0.27, w * 0.62, h * 0.15, w * 0.1);
    g.fillStyle(0x6ea9d8, 0.8);
    g.fillRoundedRect(w * 0.21, h * 0.58, w * 0.58, h * 0.1, w * 0.08);

    // Lights.
    g.fillStyle(0xfff4cc, 1);
    g.fillRoundedRect(w * 0.1, h * 0.035, w * 0.24, h * 0.055, 3);
    g.fillRoundedRect(w * 0.66, h * 0.035, w * 0.24, h * 0.055, 3);
    g.fillStyle(0xff5b5b, 1);
    g.fillRoundedRect(w * 0.1, h * 0.9, w * 0.24, h * 0.055, 3);
    g.fillRoundedRect(w * 0.66, h * 0.9, w * 0.24, h * 0.055, 3);

    g.lineStyle(2, shade(color, -0.5), 0.9);
    g.strokeRoundedRect(2, 2, w - 4, h - 4, bodyRadius);
  });
}

export function ensureRoadTextures(scene: Phaser.Scene): void {
  define(scene, TEX.grass, 128, 128, (g) => {
    g.fillStyle(PALETTE.grass, 1);
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 220; i += 1) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      g.fillStyle(Math.random() < 0.5 ? PALETTE.grassDark : shade(PALETTE.grass, 0.18), 0.5);
      g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 5);
    }
  });

  define(scene, TEX.asphalt, 128, 128, (g) => {
    g.fillStyle(PALETTE.asphalt, 1);
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i += 1) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      g.fillStyle(Math.random() < 0.5 ? PALETTE.asphaltDark : shade(PALETTE.asphalt, 0.14), 0.55);
      g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // Only speckle here, no long streaks: anything that runs the full height
    // of the tile lines up with its own copies and reads as a seam in the
    // road rather than as texture.
  });

  // One dash plus one gap, so the strip repeats seamlessly as it scrolls.
  define(scene, TEX.laneDash, 8, 128, (g) => {
    g.fillStyle(PALETTE.laneLine, 0.85);
    g.fillRoundedRect(0, 20, 8, 64, 4);
  });

  define(scene, TEX.kerb, 8, 64, (g) => {
    g.fillStyle(PALETTE.kerbRed, 1);
    g.fillRect(0, 0, 8, 32);
    g.fillStyle(0xf3f5ff, 1);
    g.fillRect(0, 32, 8, 32);
  });
}
