import Phaser from 'phaser';
import { PALETTE, displayStyle } from '../../ui/theme';

// The one number in this game that says how far a hero has come.
//
// Sigil prints no stat screen — atk, mag, def and spd only ever surface as
// the size of a damage number, and that is deliberate. Level is the exception
// because it is the only one of them the player has any say over: it is what
// routing the map for one more fight buys, and a reward nobody can see is not
// a reward.
//
// It is a badge rather than a bare numeral, and that is the whole design. A
// stray "4" beside a portrait is a quantity of something unnamed — it could
// be HP, potions, or turns. Clipped to the edge of a portrait in a filled
// disc, it reads the way a rank insignia reads, which is the closest a
// wordless game can get to writing "level".

export interface LevelBadge {
  container: Phaser.GameObjects.Container;
  set(level: number): void;
  setDimmed(dimmed: boolean): void;
}

/**
 * A level badge pinned to a portrait's lower-left.
 *
 * Lower-*left* on purpose: the party bar already wears the guard shield on
 * the lower right, and two marks fighting over one corner is how a portrait
 * stops being readable at 38px.
 */
export function createLevelBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  accent: number
): LevelBadge {
  const container = scene.add.container(x, y);

  const plate = scene.add.graphics();
  plate.fillStyle(accent, 1);
  plate.fillCircle(0, 0, radius);
  // Ringed in the backdrop colour rather than the accent: the badge sits half
  // over a painted portrait, and without a gap of its own it reads as a lump
  // of the face rather than a thing pinned to it.
  plate.lineStyle(radius * 0.22, PALETTE.skyTop, 1);
  plate.strokeCircle(0, 0, radius);

  // Dark ink on a bright disc. The reverse — a light numeral on a dark disc —
  // was tried and vanished against the portrait behind it at map size.
  const numeral = scene.add
    .text(0, 0, '', displayStyle(Math.round(radius * 1.32), PALETTE.skyTop))
    .setOrigin(0.5, 0.5);

  container.add([plate, numeral]);

  return {
    container,

    set(level: number): void {
      // Two digits get a smaller face. The cap is 12, so this is the whole of
      // the late game — and at the map strip's 8.5px radius an unshrunk "11"
      // runs out past the ring and stops looking like a badge at all.
      numeral.setFontSize(Math.round(radius * (level >= 10 ? 1.0 : 1.32)));
      numeral.setText(`${level}`);
    },

    setDimmed(dimmed: boolean): void {
      container.setAlpha(dimmed ? 0.35 : 1);
    },
  };
}
