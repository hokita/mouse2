import Phaser from 'phaser';
import { BEATS, CASTABLE } from '../core/rpg/elements';
import type { CastableElement, Element } from '../core/rpg/elements';
import type { EnemyShape } from '../core/rpg/enemies';
import type { HeroId } from '../core/rpg/party';
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
// `burst` shape serves fire, water and leaf. The player learns ten shapes once
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
/**
 * A hero's face, drawn on their portrait. Their whole identity.
 *
 * The source canvas is far larger than any place the face is used (38px on
 * the party bar, 20px on the map strip). Faces carry interior detail that a
 * sigil did not, and detail upscaled from a 34px canvas came back soft.
 */
export const FACE = 96;
/** Monsters. Drawn at the size they are tapped at. */
export const FOE = 104;
/** Nodes on the campaign map. */
export const NODE = 40;

/**
 * Texture keys. Deliberately not exported.
 *
 * Every one of these is only safe to name once something has generated it,
 * and twice in review a component reached for a key whose generator had not
 * run yet — Phaser binds the missing-texture fallback and never rebinds. The
 * table stays module-local and every key is reachable only through an
 * `ensure` that returns it, so naming a texture and generating it are the
 * same act and the bug has nowhere left to live.
 */
const QUEST_TEX = {
  cmdAttack: 'sigil-cmd-attack',
  cmdSkill: 'sigil-cmd-skill',
  cmdMight: 'sigil-cmd-might',
  cmdGuard: 'sigil-cmd-guard',
  cmdItem: 'sigil-cmd-item',
  targetRing: 'sigil-target-ring',
  triangle: 'sigil-triangle',
} as const;

/**
 * The colour of each element, and the single most load-bearing mapping here.
 *
 * A monster is drawn in the colour it *is*, and the triangle badge in the
 * corner of the fight says what beats it. That is one hop more than the
 * scheme this replaced, where a monster wore the colour of its own weakness —
 * but that scheme could only ever state one of the two rules, because a
 * single colour has no room for "and this bounces off me". One cycle,
 * drawn once, says both.
 */
export function elementColor(element: Element): number {
  switch (element) {
    case 'fire':
      return PALETTE.amber;
    case 'water':
      return PALETTE.cyan;
    case 'leaf':
      return PALETTE.lime;
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
 * One leaflet: pointed at the tip, swelling out, rounding back to a base.
 *
 * Eight points rather than four, and that is the whole reason this helper
 * exists. A four-point leaf is a rhombus, and a rhombus at fifteen pixels is
 * a diamond — an abstract mark that means nothing, which is exactly what the
 * leaf element used to read as. The bulge is what makes it a leaf.
 *
 * `len` runs tip to base along the local Y axis; `rot` turns the whole thing
 * about the base so a sprig can fan several of them out.
 */
function leaflet(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  len: number,
  rot: number,
  color: number = INK
): void {
  const w = len * 0.42;
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(rot);
  fillPolygon(
    g,
    [
      [0, -len],
      [w * 0.55, -len * 0.66],
      [w, -len * 0.24],
      [w * 0.72, len * 0.08],
      [0, len * 0.2],
      [-w * 0.72, len * 0.08],
      [-w, -len * 0.24],
      [-w * 0.55, -len * 0.66],
    ],
    color,
    1
  );
  g.restore();
}

/**
 * One element mark, at an arbitrary place, size and pair of colours.
 *
 * Split out of `ensureElementMark` so the triangle badge can draw the same
 * three marks in their own colours instead of near-white. The badge is the
 * one place in this file where a glyph is painted rather than tinted at use —
 * it has to show three elements at once, and a texture tinted at use has only
 * one colour to give.
 *
 * `punch` is whatever sits behind the mark, for the details that have to be
 * cut out rather than drawn on.
 */
function drawMark(
  g: Phaser.GameObjects.Graphics,
  element: Element,
  cx: number,
  cy: number,
  r: number,
  ink: number,
  punch: number
): void {
  if (element === 'fire') {
    fillPolygon(g, [[cx, cy - r], [cx + r, cy + r * 0.8], [cx - r, cy + r * 0.8]], ink, 1);
    return;
  }
  if (element === 'water') {
    // A droplet: pointed at the top, heavy and round at the bottom.
    fillPolygon(
      g,
      [[cx, cy - r], [cx + r * 0.72, cy + r * 0.18], [cx, cy + r * 0.5], [cx - r * 0.72, cy + r * 0.18]],
      ink,
      1
    );
    g.fillStyle(ink, 1);
    g.fillCircle(cx, cy + r * 0.3, r * 0.62);
    return;
  }
  if (element === 'leaf') {
    // Stem first, running from below the body down past the bottom edge, so
    // the silhouette is unmistakably "leaf on a stalk" before any interior
    // detail is asked to carry meaning.
    line(g, [[cx, cy + r * 0.45], [cx, cy + r * 1.15]], r * 0.22, ink);
    leaflet(g, cx, cy + r * 0.5, r * 1.42, 0, ink);
    line(g, [[cx, cy + r * 0.4], [cx, cy - r * 0.78]], r * 0.21, punch);
    return;
  }
  g.fillStyle(ink, 1);
  g.fillCircle(cx, cy, r * 0.72);
}

/**
 * The mark that stands for an element, in shape as well as colour.
 *
 * A flame points up, a droplet hangs down, a leaf sits on its stem. Carrying
 * the meaning in the silhouette too is what keeps the game playable for a
 * player who cannot separate amber from lime — with no words anywhere, a
 * colour-only code would simply lock them out.
 *
 * The leaf's stem and midrib are what make it a leaf rather than a lozenge,
 * so both are drawn to survive the two things that used to erase them: the
 * stem now runs clear of the body instead of being hidden under it, and the
 * midrib is punched in the backdrop colour rather than laid down in the same
 * ink, so it is still there after `setTint` flattens the glyph to one colour.
 * An earlier version drew both in `INK` on an `INK` body and shipped a green
 * diamond that nobody could read.
 */
export function ensureElementMark(scene: Phaser.Scene, element: Element): string {
  return glyph(scene, `sigil-mark-${element}`, MARK, (g, s) => {
    drawMark(g, element, s / 2, s / 2, s * 0.38, INK, PALETTE.skyTop);
  });
}

// --- the triangle ---------------------------------------------------------

/** The badge's canvas. Drawn well above the ~96px it is shown at. */
const TRIANGLE = 128;

/**
 * One arrow along an edge of the cycle, carrying the attacker's colour.
 *
 * Trimmed at both ends so it starts and finishes clear of the marks it runs
 * between — an arrow that touches both glyphs reads as a bracket joining
 * them rather than as a direction from one to the other.
 */
function cycleArrow(
  g: Phaser.GameObjects.Graphics,
  from: [number, number],
  to: [number, number],
  gap: number,
  width: number,
  color: number
): void {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const head = width * 2.6;

  const sx = from[0] + dx * gap;
  const sy = from[1] + dy * gap;
  const ex = to[0] - dx * gap;
  const ey = to[1] - dy * gap;

  line(g, [[sx, sy], [ex - dx * head, ey - dy * head]], width, color);

  const nx = -dy;
  const ny = dx;
  fillPolygon(
    g,
    [
      [ex, ey],
      [ex - dx * head + nx * head * 0.42, ey - dy * head + ny * head * 0.42],
      [ex - dx * head - nx * head * 0.42, ey - dy * head - ny * head * 0.42],
    ],
    color,
    1
  );
}

/**
 * The cycle, drawn once and shown in the corner of every fight.
 *
 * This badge is the whole reason a monster can be painted the colour it *is*
 * rather than the colour that kills it. Without it the player would be asked
 * to hold three arbitrary pairings in their head with nothing on screen to
 * check them against; with it, the rule is never more than a glance away and
 * the game can stop repeating the answer on every monster's chin.
 *
 * Painted rather than tinted at use — three elements at once, and a tinted
 * texture has only one colour to give.
 */
export function ensureTriangleBadge(scene: Phaser.Scene): string {
  return define(scene, QUEST_TEX.triangle, TRIANGLE, TRIANGLE, (g) => {
    const s = TRIANGLE;
    const c = s / 2;
    const radius = s * 0.315;
    const panel = shade(PALETTE.surface, 0.1);

    g.fillStyle(panel, 0.92);
    g.fillRoundedRect(0, 0, s, s, s * 0.17);
    g.lineStyle(s * 0.016, PALETTE.surfaceEdge, 0.85);
    g.strokeRoundedRect(0, 0, s, s, s * 0.17);

    // Fire at the apex, then clockwise in the order the cycle runs, so the
    // arrows never have to cross each other to get where they are going.
    const at = (element: CastableElement): [number, number] => {
      const degrees = element === 'fire' ? -90 : element === 'leaf' ? 30 : 150;
      const a = Phaser.Math.DegToRad(degrees);
      return [c + Math.cos(a) * radius, c + Math.sin(a) * radius];
    };

    for (const element of CASTABLE) {
      cycleArrow(g, at(element), at(BEATS[element]), s * 0.16, s * 0.033, elementColor(element));
    }

    for (const element of CASTABLE) {
      const [x, y] = at(element);
      drawMark(g, element, x, y, s * 0.108, elementColor(element), panel);
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
  // The same swing at weight: a broader blade with a groove down it. Weight
  // is drawn as more of the shape the player already knows, never as a new
  // shape — otherwise `strong` would be nine things to learn instead of one.
  greatblade: (g, s) => {
    poly(g, [
      [s * 0.5, s * 0.04],
      [s * 0.74, s * 0.3],
      [s * 0.63, s * 0.64],
      [s * 0.37, s * 0.64],
      [s * 0.26, s * 0.3],
    ]);
    // Punched out in the backdrop colour, the same trick the skull uses, so
    // the wider blade still reads as a blade and not as a filled wedge.
    g.lineStyle(s * 0.055, PALETTE.skyTop, 1);
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.16);
    g.lineTo(s * 0.5, s * 0.58);
    g.strokePath();
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.19, s * 0.64, s * 0.62, s * 0.1, s * 0.05);
    g.fillRoundedRect(s * 0.44, s * 0.74, s * 0.12, s * 0.19, s * 0.05);
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
  // The same bolt at weight: four more points between the four it already
  // has. Read beside a `burst` it is plainly the same star with more of it.
  starburst: (g, s) => {
    const c = s / 2;
    const points: number[][] = [];
    for (let i = 0; i < 16; i += 1) {
      const angle = (Math.PI / 8) * i - Math.PI / 2;
      const tip = i % 2 === 0;
      const known = i % 4 === 0; // the four points a plain burst already has
      // A fat waist, not a spiky one: eight thin points would read as LESS
      // than the chunky four-pointed burst, which is exactly backwards.
      const r = tip ? (known ? s * 0.48 : s * 0.34) : s * 0.21;
      points.push([c + Math.cos(angle) * r, c + Math.sin(angle) * r]);
    }
    poly(g, points);
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
  // Mends one: a cross.
  //
  // It was a droplet, which is the same drawing as the water element mark —
  // and the two sat in the same tray, one grey and one cyan, told apart by
  // colour alone. That is precisely the failure this file exists to prevent:
  // a player who cannot separate the hues would have had a heal and a bolt
  // wearing one shape. A cross belongs to no element and never will.
  drop: (g, s) => {
    const c = s / 2;
    const arm = s * 0.15;
    const reach = s * 0.38;
    g.fillStyle(INK, 1);
    g.fillRoundedRect(c - arm, c - reach, arm * 2, reach * 2, arm * 0.6);
    g.fillRoundedRect(c - reach, c - arm, reach * 2, arm * 2, arm * 0.6);
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

/**
 * The broken ring that rises off a cured combatant.
 *
 * Not a skill glyph any more: no spell lifts an ailment, so the only thing
 * that draws this is the antidote. It lives on its own rather than in the
 * skill table, which now has no cell for it.
 */
export function ensureCureRing(scene: Phaser.Scene): string {
  return glyph(scene, 'sigil-cure-ring', GLYPH, (g, s) => {
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
  });
}

// --- commands -------------------------------------------------------------

export type CommandGlyph = 'attack' | 'skill' | 'might' | 'guard' | 'item';

/**
 * The four buttons along the bottom. These four have to be legible cold, with
 * nothing else on screen to explain them, so each borrows a shape the player
 * has already met somewhere: a sword, a rod, a raised shield, a flask.
 */
export function ensureCommandGlyph(scene: Phaser.Scene, name: CommandGlyph): string {
  switch (name) {
    case 'attack':
      return glyph(scene, QUEST_TEX.cmdAttack, GLYPH, SKILL_SHAPES.blade);
    case 'skill':
      return ensureRodGlyph(scene);
    case 'might':
      return ensureMightGlyph(scene);
    case 'guard':
      return ensureGuardGlyph(scene);
    default:
      return ensureItemCommandGlyph(scene);
  }
}

/**
 * The magic rod: the SKILL command.
 *
 * It used to be the `burst` shape, which is the same star the elemental bolts
 * wear. That made the button look like one particular spell rather than the
 * door to all of them — and next to a blade, a star reads as "lightning",
 * not "magic". A rod is held, like the sword beside it, so the two buttons
 * finally answer the same question: what is this character swinging?
 */
function ensureRodGlyph(scene: Phaser.Scene): string {
  return glyph(scene, QUEST_TEX.cmdSkill, GLYPH, (g, s) => {
    const c = s / 2;
    const hx = c - s * 0.15;
    const hy = s * 0.27;

    // A straight, thick shaft leaning the opposite way to the blade, so the
    // two weapon buttons cannot be swapped at a glance in the command row.
    g.save();
    g.translateCanvas(c, c);
    g.rotateCanvas(Phaser.Math.DegToRad(20));
    g.fillStyle(INK, 1);
    g.fillRoundedRect(-s * 0.055, -s * 0.14, s * 0.11, s * 0.58, s * 0.055);
    g.restore();

    // The head is a bare orb with three sparks thrown off it. An earlier
    // version drew a ring around the orb and read as a magnifying glass —
    // a closed curve on a stick is a lens to everyone who has used a phone.
    g.fillStyle(INK, 1);
    g.fillCircle(hx, hy, s * 0.155);
    for (const [dx, dy] of [[-1, -0.75], [0.15, -1.15], [-1.15, 0.35]]) {
      const px = hx + dx * s * 0.2;
      const py = hy + dy * s * 0.2;
      poly(g, [
        [px, py - s * 0.062],
        [px + s * 0.042, py],
        [px, py + s * 0.062],
        [px - s * 0.042, py],
      ]);
    }
  });
}

/**
 * The braced fist: the father's second command.
 *
 * He carries no colour at all, so a rod over his button would be the one
 * thing on his row promising magic — and in a game with no words, a button
 * that opens a tray of things it did not describe has lied to the only sense
 * the player has. A fist opens what a fist should open: four ways to hit
 * something harder than a free swing does.
 *
 * Deliberately unlike the blade beside it. The blade is a long vertical
 * wedge; this is a squat horizontal block, so the two never trade places at
 * a glance in the command row.
 */
function ensureMightGlyph(scene: Phaser.Scene): string {
  return glyph(scene, QUEST_TEX.cmdMight, GLYPH, (g, s) => {
    const c = s / 2;

    // The fist: a rounded block of knuckles over a narrower wrist.
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.22, s * 0.3, s * 0.56, s * 0.34, s * 0.12);
    g.fillRoundedRect(s * 0.3, s * 0.6, s * 0.4, s * 0.16, s * 0.06);

    // Knuckle gaps punched in the backdrop colour, so they are still there
    // once the glyph is flattened to a single tint.
    g.fillStyle(PALETTE.skyTop, 1);
    for (let i = 1; i < 4; i += 1) {
      g.fillRect(s * 0.22 + (s * 0.56 * i) / 4 - s * 0.012, s * 0.32, s * 0.024, s * 0.16);
    }

    // The thumb, laid across the front of the fist.
    g.fillStyle(INK, 1);
    g.fillRoundedRect(s * 0.16, s * 0.46, s * 0.2, s * 0.12, s * 0.06);

    // Two short lines above, the shorthand this game already uses for force.
    for (let i = 0; i < 2; i += 1) {
      const dx = (i === 0 ? -1 : 1) * s * 0.19;
      line(g, [[c + dx, s * 0.24], [c + dx * 1.35, s * 0.1]], s * 0.06);
    }
  });
}

function ensureItemCommandGlyph(scene: Phaser.Scene): string {
  return glyph(scene, QUEST_TEX.cmdItem, GLYPH, (g, s) => {
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
}

/**
 * The half-shaded shield: the Guard command, and the mark worn by whoever is
 * currently guarding.
 *
 * Separately ensurable for the same reason as the target ring — the party bar
 * is built before the command bar, and a texture requested before it exists
 * binds to Phaser's missing-texture fallback for good.
 */
export function ensureGuardGlyph(scene: Phaser.Scene): string {
  return glyph(scene, QUEST_TEX.cmdGuard, GLYPH, (g, s) => {
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
}

/**
 * The four corner ticks that mark what a skill is pointed at.
 *
 * Has its own ensure rather than riding along with the command glyphs: the
 * enemy row is built before the command bar, so anything that waited on
 * `ensureCommandGlyphs` would be bound to Phaser's missing-texture fallback
 * for the whole of the first fight — and a texture added later does not
 * rebind an image that already missed it.
 */
export function ensureTargetRing(scene: Phaser.Scene): string {
  return glyph(scene, QUEST_TEX.targetRing, GLYPH * 1.6, (g, s) => {
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
  // The antidote: a sprig of three, not a leaf.
  //
  // It used to be a single lozenge, which made it the same drawing as the
  // leaf element one tray over — and two glyphs that differ only in size are,
  // to a player, one glyph. That collision got worse once leaf became a third
  // of the triangle badge: a lone leaf on a button now reads as "cast leaf".
  // Three leaflets on one stalk is a bundle of herbs, which nothing else in
  // the game is, and it can never be mistaken for a colour to throw.
  leaf: (g, s) => {
    // The side leaflets alternate up the stalk rather than pairing off it,
    // which is both what a real sprig does and the only arrangement that
    // survives being drawn as solid shapes. Two leaflets pivoted from the
    // same point merge at their bases into one wide mass, and the glyph came
    // back reading as a leaf sitting in a bowl.
    line(g, [[s * 0.5, s * 0.94], [s * 0.5, s * 0.3]], s * 0.062);
    leaflet(g, s * 0.5, s * 0.4, s * 0.3, 0);
    leaflet(g, s * 0.5, s * 0.62, s * 0.26, Phaser.Math.DegToRad(-70));
    leaflet(g, s * 0.5, s * 0.8, s * 0.26, Phaser.Math.DegToRad(70));
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

/**
 * The three faces, and the only names the party has.
 *
 * These are read at about 29px on the party bar, in one flat tint, so the
 * whole job is done by the outline: the daughter is widest at the top (two
 * bunches), the father is a flat-bottomed square (a beard), and the mother is
 * a tall vertical mass (long hair). Detail inside the head would be invisible
 * at this size and is not attempted — the features are punched out in the
 * backdrop colour so they survive being tinted.
 *
 * They replaced a diamond, a star and a cross. Abstract marks were learnable
 * but never meant anything; a player could tell the three apart without ever
 * having a thought about who they were.
 */
/**
 * The three faces, and the only names the party has.
 *
 * These are the one exception to the rule that runs the rest of this file.
 * Everywhere else a glyph is drawn in flat near-white and tinted at use, so
 * that colour is free to mean element — amber burns, cyan drowns, lime grows.
 * The portraits are painted instead, in skin and hair and eyes, and nothing
 * tints them.
 *
 * That exception is bought, not free. A first pass drew all three as one flat
 * colour with the features punched out, and they came back looking like a
 * cloud, a monitor and a ghost: with a single ink there is no way to say
 * "hair in front of a face", only "hole in a shape". Three colours per
 * portrait is the least that buys a face which reads as one.
 *
 * The hair colours are chosen well clear of amber, cyan and lime. A hero
 * whose hair matched an element would look like they were carrying it.
 */
const FACE_SHAPES: Record<HeroId, Draw> = {
  // The daughter: two bunches, and the widest silhouette of the three.
  daughter: (g, s) => {
    const c = s / 2;
    g.fillStyle(PALETTE.hairDaughter, 1);
    g.fillCircle(s * 0.13, s * 0.33, s * 0.13);
    g.fillCircle(s * 0.87, s * 0.33, s * 0.13);
    g.fillCircle(c, s * 0.47, s * 0.35);

    g.fillStyle(PALETTE.skin, 1);
    g.fillEllipse(c, s * 0.56, s * 0.54, s * 0.58);

    // A fringe cut straight across the brow. It is what stops the head
    // reading as a bare ball, and it is the shape a child's hair has.
    g.fillStyle(PALETTE.hairDaughter, 1);
    g.fillRoundedRect(s * 0.21, s * 0.2, s * 0.58, s * 0.19, s * 0.06);
    features(g, s, c, s * 0.56, s * 0.12);
  },

  // The father: clean-shaven, short black hair, and the squarest jaw of the
  // three. With no beard and no bunches, the jaw is the whole silhouette.
  dad: (g, s) => {
    const c = s / 2;
    // The crop is laid down first and the face drawn over it, so what is
    // left showing is a crescent that follows the skull. Drawn the other way
    // round it was a flat bar sitting on top of the head, and read as a hat.
    g.fillStyle(PALETTE.hairDad, 1);
    g.fillEllipse(c, s * 0.33, s * 0.62, s * 0.34);
    // Sideburns, stopping at the temple.
    g.fillRect(s * 0.2, s * 0.33, s * 0.07, s * 0.17);
    g.fillRect(s * 0.73, s * 0.33, s * 0.07, s * 0.17);

    g.fillStyle(PALETTE.skin, 1);
    g.fillRoundedRect(s * 0.23, s * 0.27, s * 0.54, s * 0.58, s * 0.16);
    features(g, s, c, s * 0.51, s * 0.12);
  },

  // The mother: the tallest of the three, with hair falling past the jaw on
  // both sides.
  mom: (g, s) => {
    const c = s / 2;
    // Drawn as a backing plus two side locks rather than one continuous
    // shape. A single fall ran under the chin as well as beside it, which
    // closed a loop around the face and read as a headscarf rather than hair.
    g.fillStyle(PALETTE.hairMom, 1);
    g.fillRoundedRect(s * 0.16, s * 0.3, s * 0.68, s * 0.5, s * 0.26);
    g.fillRoundedRect(s * 0.16, s * 0.4, s * 0.18, s * 0.5, s * 0.09);
    g.fillRoundedRect(s * 0.66, s * 0.4, s * 0.18, s * 0.5, s * 0.09);
    g.fillCircle(c, s * 0.42, s * 0.34);

    // The face is drawn over the backing and reaches below it, so the chin
    // is skin and the hair is left at the sides where it belongs.
    g.fillStyle(PALETTE.skin, 1);
    g.fillEllipse(c, s * 0.52, s * 0.48, s * 0.58);

    // No fringe. The hairline is simply where the face ends and the crown
    // behind it begins — an earlier version drew a band across the brow and
    // read as a headband, because a horizontal edge is the one thing hair
    // never has.
    features(g, s, c, s * 0.53, s * 0.11);
  },
};

/** Two eyes and a mouth, at the size everything else is measured from. */
function features(
  g: Phaser.GameObjects.Graphics,
  s: number,
  cx: number,
  cy: number,
  spread: number
): void {
  g.fillStyle(PALETTE.feature, 1);
  g.fillCircle(cx - spread, cy, s * 0.045);
  g.fillCircle(cx + spread, cy, s * 0.045);
  g.fillRoundedRect(cx - s * 0.07, cy + s * 0.13, s * 0.14, s * 0.035, s * 0.017);
}

/**
 * Painted rather than tinted — callers must NOT `setTint` the result. Tinting
 * a multi-colour texture multiplies every one of its colours at once, which
 * turns a face into a single wash and undoes the whole reason it is painted.
 */
export function ensureHeroFace(scene: Phaser.Scene, id: HeroId): string {
  return glyph(scene, `sigil-hero-${id}`, FACE, FACE_SHAPES[id]);
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
export type UiGlyph = 'replay' | 'home' | 'check' | 'pin' | 'up';

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
  up: (g, s) => {
    const c = s / 2;
    poly(g, [[c, s * 0.1], [c + s * 0.3, s * 0.46], [c - s * 0.3, s * 0.46]]);
    g.fillStyle(INK, 1);
    g.fillRoundedRect(c - s * 0.11, s * 0.44, s * 0.22, s * 0.34, s * 0.05);
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
