import Phaser from 'phaser';

// The shared visual language every scene draws from. Anything that appears in
// more than one place — a colour, a font size, a corner radius — belongs here
// rather than inline in a scene, so the menu and both games keep looking like
// parts of the same product.

/** Phaser wants numeric colours; Text styles want CSS strings. */
export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export const PALETTE = {
  /** Backdrop gradient, top to bottom. */
  skyTop: 0x070a1a,
  skyBottom: 0x1c1b45,

  /** Panels and cards sit on the backdrop. */
  surface: 0x161c3d,
  surfaceEdge: 0x36407a,

  text: 0xf1f4ff,
  muted: 0x8e9bc6,

  cyan: 0x45e0ff,
  violet: 0x9d7bff,
  /** Sigil's leaf element. A yellow-green, deliberately far from `cyan` and
   * `mint` — an element the player has to tell apart from water at 22px
   * cannot afford to share a hue with either. */
  lime: 0x9ae04a,
  amber: 0xffb347,
  rose: 0xff5f7e,
  mint: 0x5ef2a8,

  /**
   * Two greens, originally Car Racer's night verge and now the pond's reeds
   * and lily pads — see Fish Catch below, which is the only thing still
   * drawing with them.
   */
  grass: 0x17402a,
  grassDark: 0x0e2619,

  /**
   * Car Racer's world — a coast road driven into the sunset, which is the one
   * picture the whole genre is built on.
   *
   * The sky is the light source and everything on the ground answers to it:
   * the sun sits dead on the vanishing point, the hills between it and the
   * road are tinted toward it rather than toward black, and the asphalt is a
   * warm grey so the road reads as lit from ahead rather than from overhead.
   *
   * These are the brightest surfaces in the project — a deliberate break from
   * the other four games' night. The traffic still has to win against them,
   * which is why the verge greens stay mid-tone rather than vivid: a lime
   * verge would out-shout the cars it is there to frame.
   */
  sunsetHigh: 0x2b1b5e,
  sunsetMid: 0x7b3a86,
  sunsetWarm: 0xe4645f,
  sunsetLow: 0xffb45c,
  sunCore: 0xfff3ab,
  sunEdge: 0xff5f6d,
  /** Two ridges between the road and the sun, the near one deeper. */
  hillFar: 0x6a4180,
  hillNear: 0x35244f,
  verge: 0x39a45b,
  vergeDark: 0x2a8148,
  /** The shoulder either side of the road, and the beach the hills sit on. */
  sand: 0xe8c88e,
  asphalt: 0x72727f,
  asphaltDark: 0x666674,
  laneLine: 0xf7f9ff,
  kerbRed: 0xe23c3c,
  palmTrunk: 0x7b5536,
  palmFrond: 0x1e7a49,

  /** Fish Catch's world — a night pond, lit from under the surface. The
   * backdrop stays as dark as the other games' sky so the menu and the three
   * games read as one product; the holes are the only bright water. */
  seaTop: 0x061726,
  seaDeep: 0x0d3f57,
  pond: 0x2fa5c8,
  pondRim: 0x08283c,
  /** The rare fish, and the sparkle that announces it. */
  gold: 0xffd166,
  /** Moonlight. One light source, overhead — every rim light in the pond
   * agrees with it, which is most of what stops the scene looking flat. */
  moon: 0xdfe9ff,

  /**
   * Sigil's family, and the only place in the project where a colour is worn
   * rather than meant.
   *
   * Everywhere else colour is the game's vocabulary: amber burns, cyan
   * drowns, lime grows. These five say nothing — they exist so three faces
   * can be told apart at 38px, which one flat tint could not manage. They are
   * kept clear of amber, cyan and lime for exactly that reason: a hero whose
   * hair matched an element would read as carrying it.
   */
  skin: 0xf4cfa8,
  skinShade: 0xdcae86,
  /**
   * Two blacks and a brown. The blacks are lifted off true black on purpose:
   * a portrait sits on a dark plate, so hair at 0x000000 would lose its
   * outline into the backdrop and take the daughter's bunches with it. What
   * survives is the contrast against skin, which is the same either way.
   */
  hairDaughter: 0x24252f,
  hairDad: 0x1e1f28,
  hairMom: 0x8a5834,
  /** Eyes and mouth. Near-black, so features survive being shrunk. */
  feature: 0x2a2438,
} as const;

// A system stack keeps text crisp on every device without a webfont round
// trip — a font that arrives late would be measured wrong by the canvas and
// leave every label mis-centred on first paint.
export const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Big, heavy, tightly tracked — titles and score readouts. */
export function displayStyle(size: number, color: number = PALETTE.text): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontStyle: '900',
    fontSize: `${size}px`,
    color: css(color),
  };
}

/** Small caps-style labels: wide tracking, muted by default. */
export function labelStyle(size: number, color: number = PALETTE.muted): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontStyle: '700',
    fontSize: `${size}px`,
    color: css(color),
  };
}

export function bodyStyle(size: number, color: number = PALETTE.muted): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontStyle: '500',
    fontSize: `${size}px`,
    color: css(color),
  };
}

export const RADIUS = {
  pill: 14,
  card: 22,
  button: 16,
} as const;

/** Mixes `color` toward white (`amount` > 0) or black (`amount` < 0). */
export function shade(color: number, amount: number): number {
  const target = amount >= 0 ? 0xffffff : 0x000000;
  const t = Math.abs(amount);
  const from = Phaser.Display.Color.IntegerToColor(color);
  const to = Phaser.Display.Color.IntegerToColor(target);
  const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
}
