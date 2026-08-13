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
  amber: 0xffb347,
  rose: 0xff5f7e,
  mint: 0x5ef2a8,

  /** Car Racer's world — a night drive, so the verge stays well under the
   * road in brightness and never competes with the traffic. */
  grass: 0x17402a,
  grassDark: 0x0e2619,
  asphalt: 0x333849,
  asphaltDark: 0x282c3b,
  laneLine: 0xeef1ff,
  kerbRed: 0xd94a4a,

  /** Fish Catch's world — a night pond, lit from under the surface. The
   * backdrop stays as dark as the other games' sky so the menu and the three
   * games read as one product; the holes are the only bright water. */
  seaTop: 0x061726,
  seaDeep: 0x0d3f57,
  /** A hole's water: dark at its far edge, lit at the near one. */
  pondDeep: 0x0e4667,
  pond: 0x2fa5c8,
  pondRim: 0x08283c,
  /** The rare fish, and the sparkle that announces it. */
  gold: 0xffd166,
  /** Moonlight. One light source, overhead — every rim light in the pond
   * agrees with it, which is most of what stops the scene looking flat. */
  moon: 0xdfe9ff,
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
