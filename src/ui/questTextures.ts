import Phaser from 'phaser';
import type { Element } from '../core/rpg/elements';
import type { EnemyShape } from '../core/rpg/enemies';
import type { HeroSigil } from '../core/rpg/party';
import type { NodeKind } from '../core/rpg/nodeMap';
import type { SkillGlyph } from '../core/rpg/skills';
import type { ItemGlyph } from '../core/rpg/items';
import type { BoonGlyph } from '../core/rpg/run';
import type { StatusKind } from '../core/rpg/status';
import { PALETTE, shade } from './theme';
import { define, fillPolygon } from './textures';

// Sigil's entire language.
//
// This game says nothing in words, which makes this file the script rather
// than the artwork. Two rules hold it together:
//
//   SHAPE says what a thing does. COLOUR says which element it belongs to.
//
// So every glyph here is drawn in near-white and tinted at use, and the same
// `burst` shape serves fire, ice and spark. The player learns ten shapes once
// instead of twenty-five names never.
//
// Nothing here is an emoji, and that is not a stylistic preference. A speaker
// emoji renders differently on every platform and arrives as a hollow box on
// some (see widgets.ts) — in a UI made entirely of icons, one hollow box is
// an unreadable game.

/** Icons in the command row and the skill tray. */
export const GLYPH = 46;
/** Status pips orbiting a portrait. */
export const PIP = 20;
/** The mark that names an element. */
export const MARK = 22;
/** A hero's whole identity, drawn on their portrait. */
export const SIGIL = 34;
/** Monsters. Drawn at the size they are tapped at. */
export const FOE = 104;
/** Nodes on the campaign map. */
export const NODE = 40;

export const QUEST_TEX = {
  cmdAttack: 'sigil-cmd-attack',
  cmdSkill: 'sigil-cmd-skill',
  cmdGuard: 'sigil-cmd-guard',
  cmdItem: 'sigil-cmd-item',
  targetRing: 'sigil-target-ring',
} as const;

/**
 * The colour of each element, and the single most load-bearing mapping here.
 *
 * A monster is drawn in the colour of the element that hurts it, so the rule
 * the player has to learn is as short as a rule can be: hit it with the
 * colour it already is. Resistance is deliberately not colour-coded — one
 * rule is taught outright, and the nuance is left to be discovered from a
 * damage number that comes back small.
 */
export function elementColor(element: Element): number {
  switch (element) {
    case 'fire':
      return PALETTE.amber;
    case 'ice':
      return PALETTE.cyan;
    case 'spark':
      return PALETTE.violet;
    default:
      return PALETTE.muted;
  }
}

export function statusColor(kind: StatusKind): number {
  switch (kind) {
    case 'poison':
      return PALETTE.mint;
    case 'sleep':
      return PALETTE.cyan;
    case 'atkDown':
      return PALETTE.muted;
    default:
      return PALETTE.gold;
  }
}

type Draw = (g: Phaser.GameObjects.Graphics, size: number) => void;

const INK = PALETTE.text;

/** Bakes a glyph on a square canvas. Drawn pale so `setTint` can recolour it. */
function glyph(scene: Phaser.Scene, key: string, size: number, draw: Draw): string {
  return define(scene, key, size, size, (g) => draw(g, size));
}

function poly(g: Phaser.GameObjects.Graphics, points: number[][], color: number = INK, alpha = 1): void {
  fillPolygon(g, points, color, alpha);
}

function line(
  g: Phaser.GameObjects.Graphics,
  points: number[][],
  width: number,
  color: number = INK,
  alpha = 1
): void {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) {
    g.lineTo(x, y);
  }
  g.strokePath();
}

// --- element marks --------------------------------------------------------

/**
 * The mark that stands for an element, in shape as well as colour.
 *
 * Fire points up, ice points down, spark is a lozenge on its corner. Carrying
 * the meaning in the silhouette too is what keeps the game playable for a
 * player who cannot separate amber from violet — with no words anywhere, a
 * colour-only code would simply lock them out.
 */
export function ensureElementMark(scene: Phaser.Scene, element: Element): string {
  return glyph(scene, `sigil-mark-${element}`, MARK, (g, s) => {
    const c = s / 2;
    const r = s * 0.38;
    if (element === 'fire') {
      poly(g, [[c, c - r], [c + r, c + r * 0.8], [c - r, c + r * 0.8]]);
    } else if (element === 'ice') {
      poly(g, [[c, c + r], [c + r, c - r * 0.8], [c - r, c - r * 0.8]]);
    } else if (element === 'spark') {
      poly(g, [[c, c - r], [c + r * 0.78, c], [c, c + r], [c - r * 0.78, c]]);
    } else {
      g.fillStyle(INK, 1);
      g.fillCircle(c, c, r * 0.72);
    }
  });
}

// --- skills ---------------------------------------------------------------

const SKILL_SHAPES: Record<SkillGlyph, Draw> = {
  // A heavy single hit: a blade coming down.
  blade: (g, s) => {
    poly(g, [
      [s * 0.5, s * 0.08],
      [s * 0.66, s * 0.3],
      [s * 0.58, s * 0.68],
      [s * 0.42, s * 0.68],
      [s * 0.34, s * 0.3],
    ]);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.3, s * 0.68, s * 0.4, s * 0.09, s * 0.04);
    g.fillRoundedRect(s * 0.44, s * 0.77, s * 0.12, s * 0.16, s * 0.05);
  },
  // A sweep across everyone: three arcs fanning out.
  fan: (g, s) => {
    for (let i = 0; i < 3; i += 1) {
      const r = s * (0.2 + i * 0.13);
      g.lineStyle(s * 0.075, INK, 1 - i * 0.18);
      g.beginPath();
      g.arc(s * 0.16, s * 0.84, r, Phaser.Math.DegToRad(-78), Phaser.Math.DegToRad(-12));
      g.strokePath();
    }
  },
  // A bolt at one target: a four-pointed star with a tail.
  burst: (g, s) => {
    const c = s / 2;
    poly(g, [
      [c, s * 0.06],
      [c + s * 0.13, c - s * 0.09],
      [s * 0.94, c],
      [c + s * 0.13, c + s * 0.09],
      [c, s * 0.94],
      [c - s * 0.13, c + s * 0.09],
      [s * 0.06, c],
      [c - s * 0.13, c - s * 0.09],
    ]);
  },
  // A bolt at everyone: three stacked waves.
  wave: (g, s) => {
    for (let i = 0; i < 3; i += 1) {
      const y = s * (0.26 + i * 0.24);
      g.lineStyle(s * 0.085, INK, 1 - i * 0.14);
      g.beginPath();
      g.moveTo(s * 0.1, y);
      g.lineTo(s * 0.32, y - s * 0.09);
      g.lineTo(s * 0.54, y + s * 0.06);
      g.lineTo(s * 0.76, y - s * 0.07);
      g.lineTo(s * 0.9, y);
      g.strokePath();
    }
  },
  // Mends one: a droplet.
  drop: (g, s) => {
    const c = s / 2;
    poly(g, [
      [c, s * 0.1],
      [c + s * 0.28, s * 0.58],
      [c, s * 0.9],
      [c - s * 0.28, s * 0.58],
    ]);
    g.fillStyle(INK, 1);
    g.fillCircle(c, s * 0.62, s * 0.26);
  },
  // Mends or blesses over time: a four-petal bloom.
  bloom: (g, s) => {
    const c = s / 2;
    const r = s * 0.19;
    const reach = s * 0.24;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      g.fillStyle(INK, 0.9);
      g.fillCircle(c + dx * reach, c + dy * reach, r);
    }
    g.fillStyle(INK, 1);
    g.fillCircle(c, c, r * 0.82);
  },
  // Lifts what is stuck to you: a broken ring.
  ring: (g, s) => {
    const c = s / 2;
    g.lineStyle(s * 0.11, INK, 1);
    g.beginPath();
    g.arc(c, c, s * 0.32, Phaser.Math.DegToRad(-58), Phaser.Math.DegToRad(238));
    g.strokePath();
    poly(g, [
      [c + s * 0.34, s * 0.1],
      [c + s * 0.44, s * 0.3],
      [c + s * 0.2, s * 0.28],
    ]);
  },
  // Poison: a skull, reduced to the two things that make one.
  skull: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.22, s * 0.16, s * 0.56, s * 0.5, s * 0.2);
    g.fillRoundedRect(s * 0.34, s * 0.6, s * 0.32, s * 0.24, s * 0.07);
    // The eyes are punched out in the backdrop colour so the glyph still
    // reads as a skull once it is tinted a flat green.
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(s * 0.38, s * 0.4, s * 0.1);
    g.fillCircle(s * 0.62, s * 0.4, s * 0.1);
    g.fillRect(s * 0.46, s * 0.62, s * 0.08, s * 0.2);
    g.fillStyle(INK, 1);
    g.fillCircle(c, s * 0.55, s * 0.04);
  },
  // Sleep: a crescent.
  moon: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillCircle(c, c, s * 0.36);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c + s * 0.16, c - s * 0.13, s * 0.32);
  },
  // Weakens: an arrow pressed down under a bar.
  down: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.26, s * 0.14, s * 0.48, s * 0.1, s * 0.05);
    g.fillRect(c - s * 0.07, s * 0.3, s * 0.14, s * 0.32);
    poly(g, [
      [c - s * 0.22, s * 0.58],
      [c + s * 0.22, s * 0.58],
      [c, s * 0.88],
    ]);
  },
};

export function ensureSkillGlyph(scene: Phaser.Scene, name: SkillGlyph): string {
  return glyph(scene, `sigil-skill-${name}`, GLYPH, SKILL_SHAPES[name]);
}

// --- commands -------------------------------------------------------------

/**
 * The four buttons along the bottom. These four have to be legible cold, with
 * nothing else on screen to explain them, so each borrows a shape the player
 * has already met somewhere: a sword, a spark, a raised shield, a flask.
 */
export function ensureCommandGlyphs(scene: Phaser.Scene): void {
  glyph(scene, QUEST_TEX.cmdAttack, GLYPH, SKILL_SHAPES.blade);
  glyph(scene, QUEST_TEX.cmdSkill, GLYPH, SKILL_SHAPES.burst);
  glyph(scene, QUEST_TEX.cmdGuard, GLYPH, (g, s) => {
    const c = s / 2;
    poly(g, [
      [c, s * 0.1],
      [s * 0.84, s * 0.26],
      [s * 0.84, s * 0.56],
      [c, s * 0.92],
      [s * 0.16, s * 0.56],
      [s * 0.16, s * 0.26],
    ]);
    // Half-shaded, so a guard reads as "half of what was coming".
    g.fillStyle(PALETTE.skyTop, 0.45);
    g.fillRect(c, s * 0.1, s * 0.4, s * 0.82);
  });
  glyph(scene, QUEST_TEX.cmdItem, GLYPH, (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(c - s * 0.09, s * 0.1, s * 0.18, s * 0.16, s * 0.04);
    poly(g, [
      [c - s * 0.08, s * 0.26],
      [c + s * 0.08, s * 0.26],
      [c + s * 0.26, s * 0.86],
      [c - s * 0.26, s * 0.86],
    ]);
    g.fillStyle(PALETTE.skyTop, 0.4);
    g.fillRect(c - s * 0.22, s * 0.5, s * 0.44, s * 0.14);
  });
  glyph(scene, QUEST_TEX.targetRing, GLYPH * 1.6, (g, s) => {
    const c = s / 2;
    g.lineStyle(s * 0.045, INK, 1);
    for (let i = 0; i < 4; i += 1) {
      const a = Phaser.Math.DegToRad(45 + i * 90);
      const inner = s * 0.3;
      const outer = s * 0.46;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      g.lineTo(c + Math.cos(a) * outer, c + Math.sin(a) * outer);
      g.strokePath();
    }
  });
}

// --- items and blessings --------------------------------------------------

const ITEM_SHAPES: Record<ItemGlyph, Draw> = {
  flask: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(c - s * 0.1, s * 0.12, s * 0.2, s * 0.14, s * 0.04);
    poly(g, [
      [c - s * 0.09, s * 0.26],
      [c + s * 0.09, s * 0.26],
      [c + s * 0.28, s * 0.88],
      [c - s * 0.28, s * 0.88],
    ]);
  },
  vial: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(c - s * 0.16, s * 0.14, s * 0.32, s * 0.72, s * 0.15);
    g.fillStyle(PALETTE.skyTop, 0.45);
    g.fillRect(c - s * 0.16, s * 0.14, s * 0.32, s * 0.24);
  },
  leaf: (g, s) => {
    poly(g, [
      [s * 0.5, s * 0.1],
      [s * 0.86, s * 0.46],
      [s * 0.5, s * 0.9],
      [s * 0.14, s * 0.46],
    ]);
    line(g, [[s * 0.5, s * 0.18], [s * 0.5, s * 0.84]], s * 0.05, PALETTE.skyTop, 0.5);
  },
  orb: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillCircle(c, c * 1.12, s * 0.32);
    line(g, [[c, s * 0.28], [c + s * 0.16, s * 0.06]], s * 0.07);
  },
};

export function ensureItemGlyph(scene: Phaser.Scene, name: ItemGlyph): string {
  return glyph(scene, `sigil-item-${name}`, GLYPH, ITEM_SHAPES[name]);
}

const BOON_SHAPES: Record<BoonGlyph, Draw> = {
  heart: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillCircle(c - s * 0.16, s * 0.36, s * 0.19);
    g.fillCircle(c + s * 0.16, s * 0.36, s * 0.19);
    poly(g, [[s * 0.14, s * 0.42], [s * 0.86, s * 0.42], [c, s * 0.88]]);
  },
  spiral: (g, s) => {
    const c = s / 2;
    g.lineStyle(s * 0.09, INK, 1);
    g.beginPath();
    for (let i = 0; i <= 60; i += 1) {
      const t = (i / 60) * Math.PI * 3;
      const r = s * 0.05 + (t / (Math.PI * 3)) * s * 0.34;
      const x = c + Math.cos(t) * r;
      const y = c + Math.sin(t) * r;
      if (i === 0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    }
    g.strokePath();
  },
  edge: (g, s) => {
    poly(g, [
      [s * 0.5, s * 0.08],
      [s * 0.68, s * 0.5],
      [s * 0.5, s * 0.92],
      [s * 0.32, s * 0.5],
    ]);
    g.fillStyle(PALETTE.skyTop, 0.4);
    poly(g, [[s * 0.5, s * 0.08], [s * 0.5, s * 0.92], [s * 0.32, s * 0.5]], PALETTE.skyTop, 0.4);
  },
  shield: (g, s) => {
    const c = s / 2;
    poly(g, [
      [c, s * 0.1],
      [s * 0.84, s * 0.26],
      [s * 0.84, s * 0.56],
      [c, s * 0.92],
      [s * 0.16, s * 0.56],
      [s * 0.16, s * 0.26],
    ]);
  },
  wing: (g, s) => {
    for (let i = 0; i < 3; i += 1) {
      const y = s * (0.3 + i * 0.2);
      g.fillStyle(INK, 1 - i * 0.2);
      g.fillRoundedRect(s * (0.12 + i * 0.1), y, s * (0.72 - i * 0.18), s * 0.11, s * 0.055);
    }
  },
};

export function ensureBoonGlyph(scene: Phaser.Scene, name: BoonGlyph): string {
  return glyph(scene, `sigil-boon-${name}`, GLYPH, BOON_SHAPES[name]);
}

// --- heroes ---------------------------------------------------------------

const SIGIL_SHAPES: Record<HeroSigil, Draw> = {
  diamond: (g, s) => {
    const c = s / 2;
    poly(g, [[c, s * 0.06], [s * 0.94, c], [c, s * 0.94], [s * 0.06, c]]);
  },
  star: (g, s) => {
    const c = s / 2;
    const points: number[][] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = Phaser.Math.DegToRad(-90 + i * 30);
      const r = (i % 2 === 0 ? 0.46 : 0.2) * s;
      points.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
    }
    poly(g, points);
  },
  cross: (g, s) => {
    const c = s / 2;
    const arm = s * 0.15;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(c - arm, s * 0.06, arm * 2, s * 0.88, arm * 0.5);
    g.fillRoundedRect(s * 0.06, c - arm, s * 0.88, arm * 2, arm * 0.5);
  },
};

export function ensureHeroSigil(scene: Phaser.Scene, sigil: HeroSigil): string {
  return glyph(scene, `sigil-hero-${sigil}`, SIGIL, SIGIL_SHAPES[sigil]);
}

// --- statuses -------------------------------------------------------------

const STATUS_SHAPES: Record<StatusKind, Draw> = {
  poison: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillCircle(c, c * 1.08, s * 0.3);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c - s * 0.1, c, s * 0.06);
    g.fillCircle(c + s * 0.1, c, s * 0.06);
  },
  sleep: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillCircle(c, c, s * 0.34);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c + s * 0.15, c - s * 0.12, s * 0.3);
  },
  atkDown: (g, s) => {
    const c = s / 2;
    poly(g, [[c - s * 0.3, s * 0.3], [c + s * 0.3, s * 0.3], [c, s * 0.78]]);
  },
  regen: (g, s) => {
    const c = s / 2;
    const arm = s * 0.13;
    g.fillStyle(INK, 1);
    g.fillRect(c - arm, s * 0.18, arm * 2, s * 0.64);
    g.fillRect(s * 0.18, c - arm, s * 0.64, arm * 2);
  },
};

export function ensureStatusPip(scene: Phaser.Scene, kind: StatusKind): string {
  return glyph(scene, `sigil-status-${kind}`, PIP, STATUS_SHAPES[kind]);
}

// --- the map --------------------------------------------------------------

const NODE_SHAPES: Record<NodeKind, Draw> = {
  start: (g, s) => {
    const c = s / 2;
    g.lineStyle(s * 0.1, INK, 1);
    g.strokeCircle(c, c, s * 0.28);
  },
  battle: (g, s) => {
    // Two crossed blades: the shape the command row already uses for attack.
    const draw = (flip: number): void => {
      g.save();
      g.translateCanvas(s / 2, s / 2);
      g.rotateCanvas(Phaser.Math.DegToRad(35 * flip));
      g.fillStyle(INK, 1);
      g.fillRect(-s * 0.05, -s * 0.36, s * 0.1, s * 0.56);
      poly(g, [[-s * 0.05, -s * 0.36], [s * 0.05, -s * 0.36], [0, -s * 0.46]]);
      g.fillRect(-s * 0.14, s * 0.18, s * 0.28, s * 0.07);
      g.restore();
    };
    draw(1);
    draw(-1);
  },
  elite: (g, s) => {
    NODE_SHAPES.battle(g, s);
    // A crown of three points above the blades says "same fight, more of it".
    poly(g, [
      [s * 0.28, s * 0.2],
      [s * 0.38, s * 0.06],
      [s * 0.5, s * 0.18],
      [s * 0.62, s * 0.06],
      [s * 0.72, s * 0.2],
    ]);
  },
  rest: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.16, c, s * 0.68, s * 0.28, s * 0.06);
    g.fillRoundedRect(s * 0.16, s * 0.3, s * 0.3, s * 0.24, s * 0.1);
    g.fillRect(s * 0.16, s * 0.28, s * 0.06, s * 0.5);
  },
  treasure: (g, s) => {
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.16, s * 0.34, s * 0.68, s * 0.46, s * 0.06);
    g.fillStyle(PALETTE.skyTop, 0.55);
    g.fillRect(s * 0.16, s * 0.48, s * 0.68, s * 0.08);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.44, s * 0.44, s * 0.12, s * 0.18, s * 0.04);
  },
  shrine: (g, s) => {
    const c = s / 2;
    const points: number[][] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = Phaser.Math.DegToRad(-90 + i * 45);
      const r = (i % 2 === 0 ? 0.44 : 0.16) * s;
      points.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
    }
    poly(g, points);
  },
  boss: (g, s) => {
    const c = s / 2;
    poly(g, [
      [s * 0.14, s * 0.74],
      [s * 0.2, s * 0.26],
      [s * 0.35, s * 0.48],
      [c, s * 0.16],
      [s * 0.65, s * 0.48],
      [s * 0.8, s * 0.26],
      [s * 0.86, s * 0.74],
    ]);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.14, s * 0.74, s * 0.72, s * 0.12, s * 0.04);
  },
};

export function ensureNodeGlyph(scene: Phaser.Scene, kind: NodeKind): string {
  return glyph(scene, `sigil-node-${kind}`, NODE, NODE_SHAPES[kind]);
}

// --- monsters -------------------------------------------------------------

/**
 * Nine silhouettes, drawn pale and tinted at use with the colour of the
 * element that kills them.
 *
 * They differ by outline rather than by detail on purpose: at 104px on a
 * phone, held at arm's length, the only thing that survives is the shape
 * against the background. Two monsters that differ in their faces are, for
 * playing purposes, the same monster.
 */
const FOE_SHAPES: Record<EnemyShape, Draw> = {
  blob: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillEllipse(c, s * 0.62, s * 0.74, s * 0.6);
    g.fillEllipse(c, s * 0.36, s * 0.5, s * 0.36);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c - s * 0.12, s * 0.4, s * 0.06);
    g.fillCircle(c + s * 0.12, s * 0.4, s * 0.06);
  },
  imp: (g, s) => {
    const c = s / 2;
    poly(g, [[s * 0.26, s * 0.3], [s * 0.34, s * 0.08], [s * 0.44, s * 0.28]]);
    poly(g, [[s * 0.56, s * 0.28], [s * 0.66, s * 0.08], [s * 0.74, s * 0.3]]);
    g.fillStyle(INK, 1);
    g.fillEllipse(c, s * 0.46, s * 0.52, s * 0.36);
    poly(g, [[s * 0.3, s * 0.56], [s * 0.7, s * 0.56], [s * 0.6, s * 0.92], [s * 0.4, s * 0.92]]);
    poly(g, [[s * 0.24, s * 0.5], [s * 0.04, s * 0.66], [s * 0.24, s * 0.72]]);
    poly(g, [[s * 0.76, s * 0.5], [s * 0.96, s * 0.66], [s * 0.76, s * 0.72]]);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c - s * 0.1, s * 0.44, s * 0.05);
    g.fillCircle(c + s * 0.1, s * 0.44, s * 0.05);
  },
  wisp: (g, s) => {
    const c = s / 2;
    poly(g, [
      [c, s * 0.12],
      [c + s * 0.24, s * 0.5],
      [c, s * 0.86],
      [c - s * 0.24, s * 0.5],
    ]);
    g.lineStyle(s * 0.045, INK, 0.7);
    g.strokeEllipse(c, s * 0.56, s * 0.76, s * 0.3);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c, s * 0.46, s * 0.07);
  },
  crab: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillEllipse(c, s * 0.56, s * 0.62, s * 0.4);
    // Claws, the thing that makes a crab a crab at any size.
    g.fillCircle(s * 0.16, s * 0.38, s * 0.13);
    g.fillCircle(s * 0.84, s * 0.38, s * 0.13);
    line(g, [[s * 0.26, s * 0.46], [s * 0.38, s * 0.54]], s * 0.07);
    line(g, [[s * 0.74, s * 0.46], [s * 0.62, s * 0.54]], s * 0.07);
    for (let i = 0; i < 3; i += 1) {
      const x = s * (0.32 + i * 0.18);
      line(g, [[x, s * 0.72], [x - s * 0.04, s * 0.9]], s * 0.05);
    }
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c - s * 0.1, s * 0.48, s * 0.05);
    g.fillCircle(c + s * 0.1, s * 0.48, s * 0.05);
  },
  shade: (g, s) => {
    const c = s / 2;
    // A hood with nothing in it.
    poly(g, [
      [c, s * 0.1],
      [s * 0.78, s * 0.44],
      [s * 0.72, s * 0.92],
      [s * 0.28, s * 0.92],
      [s * 0.22, s * 0.44],
    ]);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillEllipse(c, s * 0.44, s * 0.34, s * 0.32);
    g.fillStyle(INK, 1);
    g.fillCircle(c - s * 0.07, s * 0.44, s * 0.045);
    g.fillCircle(c + s * 0.07, s * 0.44, s * 0.045);
  },
  golem: (g, s) => {
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.26, s * 0.22, s * 0.48, s * 0.44, s * 0.09);
    g.fillRoundedRect(s * 0.06, s * 0.34, s * 0.18, s * 0.4, s * 0.07);
    g.fillRoundedRect(s * 0.76, s * 0.34, s * 0.18, s * 0.4, s * 0.07);
    g.fillRoundedRect(s * 0.3, s * 0.68, s * 0.16, s * 0.24, s * 0.05);
    g.fillRoundedRect(s * 0.54, s * 0.68, s * 0.16, s * 0.24, s * 0.05);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillRect(s * 0.36, s * 0.36, s * 0.1, s * 0.06);
    g.fillRect(s * 0.54, s * 0.36, s * 0.1, s * 0.06);
  },
  wyrm: (g, s) => {
    g.lineStyle(s * 0.15, INK, 1);
    g.beginPath();
    g.moveTo(s * 0.16, s * 0.9);
    g.lineTo(s * 0.36, s * 0.62);
    g.lineTo(s * 0.2, s * 0.42);
    g.lineTo(s * 0.46, s * 0.26);
    g.strokePath();
    g.fillStyle(INK, 1);
    g.fillEllipse(s * 0.62, s * 0.24, s * 0.42, s * 0.26);
    poly(g, [[s * 0.5, s * 0.14], [s * 0.56, s * 0.02], [s * 0.62, s * 0.14]]);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(s * 0.7, s * 0.22, s * 0.05);
  },
  drake: (g, s) => {
    const c = s / 2;
    poly(g, [[s * 0.06, s * 0.2], [s * 0.42, s * 0.44], [s * 0.1, s * 0.66]]);
    poly(g, [[s * 0.94, s * 0.2], [s * 0.58, s * 0.44], [s * 0.9, s * 0.66]]);
    g.fillStyle(INK, 1);
    g.fillEllipse(c, s * 0.52, s * 0.44, s * 0.44);
    poly(g, [[s * 0.36, s * 0.26], [s * 0.3, s * 0.06], [s * 0.48, s * 0.2]]);
    poly(g, [[s * 0.64, s * 0.26], [s * 0.7, s * 0.06], [s * 0.52, s * 0.2]]);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c - s * 0.1, s * 0.46, s * 0.055);
    g.fillCircle(c + s * 0.1, s * 0.46, s * 0.055);
    poly(g, [[c - s * 0.1, s * 0.66], [c + s * 0.1, s * 0.66], [c, s * 0.76]], PALETTE.skyTop, 1);
  },
  crown: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    // Robed body, wide and immovable.
    poly(g, [[s * 0.2, s * 0.94], [s * 0.3, s * 0.42], [s * 0.7, s * 0.42], [s * 0.8, s * 0.94]]);
    g.fillEllipse(c, s * 0.4, s * 0.42, s * 0.34);
    // The crown itself: five points, the tallest thing on the screen.
    poly(g, [
      [s * 0.24, s * 0.3],
      [s * 0.29, s * 0.06],
      [s * 0.38, s * 0.22],
      [c, s * 0.0],
      [s * 0.62, s * 0.22],
      [s * 0.71, s * 0.06],
      [s * 0.76, s * 0.3],
    ]);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillCircle(c - s * 0.09, s * 0.42, s * 0.05);
    g.fillCircle(c + s * 0.09, s * 0.42, s * 0.05);
  },
};

export function ensureFoeTexture(scene: Phaser.Scene, shape: EnemyShape): string {
  return glyph(scene, `sigil-foe-${shape}`, FOE, FOE_SHAPES[shape]);
}

// --- interface glyphs -----------------------------------------------------

/**
 * The handful of shapes that are about the game rather than in it: play
 * again, back to the menu, this one is done, and this one is where you are.
 *
 * These are the glyphs a wordless game cannot borrow from its own fiction, so
 * they lean on conventions the player already owns from every other app on
 * the phone — a circling arrow means again, a house means out.
 */
export type UiGlyph = 'replay' | 'home' | 'check' | 'pin';

const UI_SHAPES: Record<UiGlyph, Draw> = {
  replay: (g, s) => {
    const c = s / 2;
    g.lineStyle(s * 0.11, INK, 1);
    g.beginPath();
    g.arc(c, c, s * 0.3, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(230));
    g.strokePath();
    poly(g, [
      [c + s * 0.34, s * 0.12],
      [c + s * 0.36, s * 0.36],
      [c + s * 0.12, s * 0.28],
    ]);
  },
  home: (g, s) => {
    const c = s / 2;
    poly(g, [[c, s * 0.12], [s * 0.88, s * 0.5], [s * 0.12, s * 0.5]]);
    g.fillStyle(INK, 1);
    g.fillRect(s * 0.24, s * 0.48, s * 0.52, s * 0.4);
    g.fillStyle(PALETTE.skyTop, 1);
    g.fillRect(s * 0.42, s * 0.62, s * 0.16, s * 0.26);
  },
  check: (g, s) => {
    line(g, [[s * 0.2, s * 0.52], [s * 0.42, s * 0.74], [s * 0.8, s * 0.26]], s * 0.13);
  },
  pin: (g, s) => {
    const c = s / 2;
    g.fillStyle(INK, 1);
    g.fillCircle(c, s * 0.4, s * 0.24);
    poly(g, [[c - s * 0.18, s * 0.52], [c + s * 0.18, s * 0.52], [c, s * 0.9]]);
  },
};

export function ensureUiGlyph(scene: Phaser.Scene, name: UiGlyph): string {
  return glyph(scene, `sigil-ui-${name}`, GLYPH, UI_SHAPES[name]);
}

/** A soft plate to sit a glyph on, so an icon never floats on the backdrop. */
export function ensurePlateTexture(scene: Phaser.Scene): string {
  return define(scene, 'sigil-plate', 96, 96, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 96, 96, 26);
  });
}

export { shade };
