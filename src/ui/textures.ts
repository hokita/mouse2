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
  ship: 'dodger-ship',
  boss: 'dodger-boss',
  sky: 'car-sky',
  sun: 'car-sun',
  hills: 'car-hills',
  clouds: 'car-clouds',
  palm: 'car-palm',
  boost: 'car-boost',
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

/**
 * How wide a car is, in lateral units — which are screen pixels at the
 * player's row, so this is both the width it is drawn at and the width it is
 * hit at. How *long* it is belongs to the scene rather than here: length is
 * measured in road, and only the camera knows how much road a drawn car
 * stands on.
 */
export const CAR_WIDTH = 44;

/** How tall a car stands at the player's row. */
export const CAR_ART_HEIGHT = 50;

// Drawn at twice the size it is ever shown at. Every car on the road is the
// same texture scaled down by its distance, and starting from twice the size
// is what keeps the one at the player's bumper from looking chewed.
const CAR_ART_DETAIL = 2;

/**
 * A car seen from behind and a little above, which is the only view a car in
 * front of you has.
 *
 * The light is the thing to get right: the sun is on the horizon ahead, so
 * every car on this road is backlit. The rear is in its own shadow — hence a
 * body darker than the paint it is nominally wearing — and what says
 * "three-dimensional" is the warm edge along the roof where the light gets
 * round it, plus the cabin sitting in front of a boot that is darker again.
 *
 * At the horizon this is ten pixels across, so the silhouette carries it: a
 * dark cabin over a coloured body, with two red lights.
 */
export function ensureCarTexture(
  scene: Phaser.Scene,
  color: number,
  options: { stripe?: boolean } = {}
): string {
  const w = CAR_WIDTH * CAR_ART_DETAIL;
  const h = CAR_ART_HEIGHT * CAR_ART_DETAIL;

  return define(scene, carTexture(color), w, h, (g) => {
    const body = shade(color, -0.16);
    const lower = shade(color, -0.4);
    const cabin = shade(color, -0.52);

    // Tyres, first so the body sits over their inner edge.
    g.fillStyle(0x15121d, 1);
    g.fillRoundedRect(1, h * 0.68, w * 0.19, h * 0.3, 5);
    g.fillRoundedRect(w * 0.81 - 1, h * 0.68, w * 0.19, h * 0.3, 5);

    // Cabin and rear window. The window is the darkest thing on the car,
    // which is what stops a distant one from reading as a coloured brick.
    fillPolygon(g, [
      [w * 0.29, h * 0.06],
      [w * 0.71, h * 0.06],
      [w * 0.82, h * 0.43],
      [w * 0.18, h * 0.43],
    ], cabin);
    fillPolygon(g, [
      [w * 0.34, h * 0.12],
      [w * 0.66, h * 0.12],
      [w * 0.75, h * 0.39],
      [w * 0.25, h * 0.39],
    ], 0x111629);
    // A little sky caught in the glass, along its top edge.
    fillPolygon(g, [
      [w * 0.35, h * 0.13],
      [w * 0.65, h * 0.13],
      [w * 0.68, h * 0.22],
      [w * 0.32, h * 0.22],
    ], 0x2c3a63, 0.85);

    // The sun is ahead of the car, so the light that reaches us is the sliver
    // getting round the roof.
    g.fillStyle(PALETTE.sunCore, 0.7);
    g.fillRoundedRect(w * 0.3, h * 0.045, w * 0.4, h * 0.03, 2);

    // Boot and rear quarters, then the bumper below them.
    g.fillStyle(body, 1);
    g.fillRoundedRect(w * 0.06, h * 0.4, w * 0.88, h * 0.44, w * 0.1);
    g.fillStyle(lower, 1);
    g.fillRoundedRect(w * 0.06, h * 0.72, w * 0.88, h * 0.2, w * 0.07);

    // Shoulder line: the one horizontal that says where the boot lid ends.
    g.fillStyle(shade(color, -0.62), 0.55);
    g.fillRect(w * 0.09, h * 0.55, w * 0.82, h * 0.02);

    if (options.stripe) {
      g.fillStyle(0xffffff, 0.34);
      g.fillRect(w * 0.44, h * 0.05, w * 0.05, h * 0.82);
      g.fillRect(w * 0.51, h * 0.05, w * 0.05, h * 0.82);
    }

    // Tail lights, with a hot core so they still read at ten pixels wide.
    for (const x of [w * 0.1, w * 0.66]) {
      g.fillStyle(0x5d1522, 1);
      g.fillRoundedRect(x, h * 0.58, w * 0.24, h * 0.12, 3);
      g.fillStyle(0xff4a4a, 1);
      g.fillRoundedRect(x + 2, h * 0.6, w * 0.24 - 4, h * 0.08, 2);
      g.fillStyle(0xffd6d6, 0.85);
      g.fillRoundedRect(x + 4, h * 0.615, w * 0.24 - 8, h * 0.03, 1);
    }

    g.fillStyle(0xe9edff, 0.9);
    g.fillRoundedRect(w * 0.4, h * 0.72, w * 0.2, h * 0.1, 2);

    g.lineStyle(2, shade(color, -0.68), 0.8);
    g.strokeRoundedRect(w * 0.06, h * 0.4, w * 0.88, h * 0.44, w * 0.1);
  });
}

// The road itself is not a texture any more: it is redrawn every frame in
// perspective by scenes/car/road.ts, which needs the markings to bunch up
// toward the horizon rather than repeat at a fixed pitch. What is left here is
// the scenery the road drives into.

export const SUN_SIZE = 200;
export const PALM_WIDTH = 76;
export const PALM_HEIGHT = 172;

/**
 * The sky, as one tall gradient: indigo overhead through violet and a red
 * band into gold at the horizon. Four stops rather than two because a single
 * interpolation from indigo to gold passes through a muddy brown — the red
 * band in the middle is what makes it read as a sunset.
 */
export function ensureSkyTexture(scene: Phaser.Scene): string {
  const stops: [number, number][] = [
    [0, PALETTE.sunsetHigh],
    [0.42, PALETTE.sunsetMid],
    [0.74, PALETTE.sunsetWarm],
    [1, PALETTE.sunsetLow],
  ];

  return define(scene, TEX.sky, 4, 256, (g) => {
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      let next = 1;
      while (next < stops.length - 1 && stops[next][0] < t) {
        next += 1;
      }
      const [fromStop, fromColor] = stops[next - 1];
      const [toStop, toColor] = stops[next];
      const local = (t - fromStop) / (toStop - fromStop);
      const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(fromColor),
        Phaser.Display.Color.IntegerToColor(toColor),
        100,
        Math.round(local * 100)
      );
      g.fillStyle(Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b), 1);
      g.fillRect(0, i, 4, 1);
    }
  });
}

/**
 * The sun, sitting on the vanishing point: a disc that pales from gold at the
 * top to red at the bottom, sliced by gaps that widen as they go down.
 *
 * The gaps are drawn as absence rather than as bars of sky — the sky behind it
 * is a gradient, so painted-on bars would only match at one height and show as
 * a seam everywhere else.
 */
export function ensureSunTexture(scene: Phaser.Scene): string {
  return define(scene, TEX.sun, SUN_SIZE, SUN_SIZE, (g) => {
    const radius = SUN_SIZE / 2;

    // Walk down from a fifth of the way in, laying out the gaps: each bar of
    // sun is thinner than the one above it and each gap is wider, which is
    // what makes the disc look like it is sinking rather than stencilled. The
    // walk starts high because only the part above the horizon is ever seen.
    const gaps: [number, number][] = [];
    let cursor = SUN_SIZE * 0.2;
    let bar = SUN_SIZE * 0.11;
    let gap = SUN_SIZE * 0.021;
    while (cursor < SUN_SIZE) {
      cursor += bar;
      gaps.push([cursor, cursor + gap]);
      cursor += gap;
      bar = Math.max(SUN_SIZE * 0.03, bar * 0.78);
      gap *= 1.24;
    }

    const from = Phaser.Display.Color.IntegerToColor(PALETTE.sunCore);
    const to = Phaser.Display.Color.IntegerToColor(PALETTE.sunEdge);

    for (let y = 0; y < SUN_SIZE; y += 1) {
      if (gaps.some(([top, bottom]) => y >= top && y < bottom)) {
        continue;
      }
      const dy = y + 0.5 - radius;
      const half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
      if (half <= 0) {
        continue;
      }
      const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, SUN_SIZE - 1, y);
      g.fillStyle(Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b), 1);
      g.fillRect(radius - half, y, half * 2, 1);
    }
  });
}

/**
 * A ridge line, drawn white so the two copies of it that stand between the
 * road and the sun can be tinted to their own distances. Built from three
 * sine waves at different rates: one hump would read as a single hill, and
 * three beating against each other read as a range.
 */
export function ensureHillsTexture(scene: Phaser.Scene): string {
  const width = 512;
  const height = 96;

  return define(scene, TEX.hills, width, height, (g) => {
    g.fillStyle(0xffffff, 1);
    for (let x = 0; x < width; x += 1) {
      // A whole number of cycles across the texture, so two copies of it side
      // by side still meet at the same height.
      const t = (x / width) * Math.PI * 2;
      const ridge =
        height * 0.52 + Math.sin(t) * 17 + Math.sin(t * 3 + 1.1) * 9 + Math.sin(t * 6 + 0.4) * 4;
      g.fillRect(x, height - ridge, 1, ridge);
    }
  });
}

/**
 * Cloud bars for the upper sky, white to be tinted warm where they are used.
 * Anything crossing an edge is drawn again a texture-width away so the strip
 * still tiles once it is scrolling.
 */
export function ensureCloudTexture(scene: Phaser.Scene): string {
  const width = 256;
  const height = 128;

  return define(scene, TEX.clouds, width, height, (g) => {
    const bars = [
      { x: 40, y: 26, w: 78, h: 9 },
      { x: 150, y: 52, w: 96, h: 11 },
      { x: 18, y: 86, w: 62, h: 8 },
      { x: 210, y: 104, w: 84, h: 10 },
      { x: 112, y: 12, w: 52, h: 7 },
    ];

    for (const bar of bars) {
      for (const offset of [0, -width, width]) {
        // Three nested ellipses: a flat-bottomed smear, softest at the edges.
        for (let layer = 0; layer < 3; layer += 1) {
          const shrink = layer * 0.22;
          g.fillStyle(0xffffff, 0.3);
          g.fillEllipse(bar.x + offset, bar.y, bar.w * (1 - shrink), bar.h * (1 - shrink * 0.4));
        }
      }
    }
  });
}

/**
 * A palm, seen side-on with its base at the bottom edge of the texture, which
 * is where the scene plants it on the ground. Fronds in two greens so the
 * crown has a front and a back at 30 px, which is the size most of them spend
 * their life at.
 */
export function ensurePalmTexture(scene: Phaser.Scene): string {
  return define(scene, TEX.palm, PALM_WIDTH, PALM_HEIGHT, (g) => {
    const baseX = PALM_WIDTH * 0.46;
    const crownY = PALM_HEIGHT * 0.36;

    // Trunk: leans a little, narrows as it climbs. Drawn as a stack of short
    // bars so the lean stays smooth without a polygon per segment.
    const steps = 44;
    let topX = baseX;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = baseX + Math.sin(t * 1.15) * 11;
      const y = PALM_HEIGHT - t * (PALM_HEIGHT - crownY);
      const halfWidth = 5.2 - t * 2.4;
      g.fillStyle(i % 6 < 3 ? PALETTE.palmTrunk : shade(PALETTE.palmTrunk, -0.22), 1);
      g.fillRect(x - halfWidth, y - 4, halfWidth * 2, 5);
      topX = x;
    }

    // Coconuts, tucked under the crown.
    g.fillStyle(shade(PALETTE.palmTrunk, -0.4), 1);
    g.fillCircle(topX - 4, crownY + 4, 3.2);
    g.fillCircle(topX + 3, crownY + 6, 2.8);

    // Nine fronds, each a drooping arc of thinning discs. The crown has to
    // carry the whole silhouette — a palm is recognised by its head, and at
    // the size most of these are seen at the trunk is barely two pixels wide.
    const fronds = 9;
    for (let i = 0; i < fronds; i += 1) {
      const spread = -3.05 + (i / (fronds - 1)) * 2.9;
      const length = 30 + (i % 2 === 0 ? 8 : 0);
      const color = i % 2 === 0 ? PALETTE.palmFrond : shade(PALETTE.palmFrond, -0.3);
      g.fillStyle(color, 1);
      for (let s = 0; s <= 14; s += 1) {
        const t = s / 14;
        const reach = t * length;
        // The droop grows with the square of the reach, so the frond leaves
        // the trunk straight and falls away at its tip.
        const x = topX + Math.cos(spread) * reach;
        const y = crownY + Math.sin(spread) * reach + t * t * 20;
        g.fillCircle(x, y, 5 * (1 - t * 0.72));
      }
    }
  });
}

export const BOOST_SIZE = 40;

/**
 * The speed pickup: a mint disc with a double chevron pointing up the road.
 *
 * Mint is reserved for this — no traffic car wears it (see TRAFFIC_COLORS) —
 * because a pickup you mistake for a car at 700 px/s is a pickup you swerve
 * away from. The chevrons say "faster" without a word of text, and the disc
 * is less than half a car wide so it never reads as one.
 */
export function ensureBoostTexture(scene: Phaser.Scene): string {
  return define(scene, TEX.boost, BOOST_SIZE, BOOST_SIZE, (g) => {
    const mid = BOOST_SIZE / 2;

    g.fillStyle(shade(PALETTE.mint, -0.45), 1);
    g.fillCircle(mid, mid, mid - 1);
    g.fillStyle(PALETTE.mint, 1);
    g.fillCircle(mid, mid, mid - 4);
    // Lit from overhead, like everything else in the project.
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(mid, mid - 5, mid - 8);

    const chevron = (top: number): number[][] => [
      [9, top + 10],
      [mid, top],
      [31, top + 10],
      [31, top + 15],
      [mid, top + 5],
      [9, top + 15],
    ];
    fillPolygon(g, chevron(8), 0x0d2b1e, 0.9);
    fillPolygon(g, chevron(17), 0x0d2b1e, 0.9);
  });
}
