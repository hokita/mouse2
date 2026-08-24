import { chance, pick, randInt } from './rng';
import type { Rng } from './rng';
import type { Tier } from './enemies';

// The campaign, as a graph you tap through.
//
// Chosen over a walkable overworld for a reason that is really about the
// phone: a d-pad or a tap-to-move layer would eat the bottom third of the
// screen and most of the build, and would spend it on traversal rather than
// on the fights. Here every node is a decision and nothing in between is
// anything at all.
//
// The map is also the only place the run's shape is visible. With no text
// there is no chapter title and no quest log, so the player's sense of "how
// far in am I" has to come from watching the icons above them run out.

export type NodeKind = 'start' | 'battle' | 'elite' | 'rest' | 'treasure' | 'shrine' | 'boss';

/**
 * Fourteen rows: a start, twelve of content, and the boss.
 *
 * Sized to the screen rather than to a target playtime. 932px minus the HUD
 * leaves room for fourteen rows at about 55px each, which is exactly one node
 * plus air. A longer campaign would have to scroll, and a map that scrolls is
 * a map the player cannot plan a route across at a glance — which is the only
 * thing this screen is for.
 */
export const MAP_ROWS = 14;

/** Three abreast is what 430px holds with thumb-sized targets. */
export const MAX_ROW_WIDTH = 3;

export interface MapNode {
  id: number;
  row: number;
  /** Position across the row, 0-based. The scene spreads these evenly. */
  col: number;
  kind: NodeKind;
  tier: Tier;
  /** Nodes on the next row down that this one leads to. */
  next: number[];
}

export interface NodeMap {
  nodes: MapNode[];
  startId: number;
  bossId: number;
}

export function nodeAt(map: NodeMap, id: number): MapNode | undefined {
  return map.nodes.find((node) => node.id === id);
}

export function optionsFrom(map: NodeMap, id: number): MapNode[] {
  return (nodeAt(map, id)?.next ?? []).map((next) => nodeAt(map, next)!);
}

/** Rows 1-4 are tier 1, 5-8 tier 2, 9-12 tier 3, and the last row is the boss. */
export function tierForRow(row: number): Tier {
  if (row >= MAP_ROWS - 1) {
    return 4;
  }
  if (row <= 4) {
    return 1;
  }
  if (row <= 8) {
    return 2;
  }
  return 3;
}

/** Weights for the middle rows. Battles dominate; everything else is a break. */
const KIND_WEIGHTS: [NodeKind, number][] = [
  ['battle', 52],
  ['elite', 10],
  ['treasure', 14],
  ['shrine', 13],
  ['rest', 11],
];

function rollKind(rng: Rng): NodeKind {
  const total = KIND_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [kind, weight] of KIND_WEIGHTS) {
    roll -= weight;
    if (roll < 0) {
      return kind;
    }
  }
  return 'battle';
}

function kindsForRow(row: number, width: number, rng: Rng): NodeKind[] {
  if (row === 0) {
    return ['start'];
  }
  if (row === MAP_ROWS - 1) {
    return ['boss'];
  }
  // The opening row is always a plain fight. The first thing the game does is
  // teach the player that colour matters, and it cannot do that at a shrine.
  if (row === 1) {
    return Array.from({ length: width }, () => 'battle' as NodeKind);
  }
  // A bed before the boss, on every route. The last fight should be lost to a
  // misread colour, never to having taken the wrong turn four rows earlier.
  if (row === MAP_ROWS - 2) {
    return Array.from({ length: width }, () => 'rest' as NodeKind);
  }

  const kinds = Array.from({ length: width }, () => rollKind(rng));
  // Guarantee a fight somewhere in every row. Without it a run can contain a
  // rank of pure shops, and a party that skipped four rows of EXP meets the
  // boss underlevelled with no way of knowing why.
  if (!kinds.some((kind) => kind === 'battle' || kind === 'elite')) {
    kinds[randInt(rng, 0, width - 1)] = 'battle';
  }
  return kinds;
}

/**
 * Builds the graph row by row.
 *
 * Edges are drawn so that every node has somewhere to go and somewhere it
 * came from. The two passes below are what enforce that: the first gives each
 * node on the upper row one or two children, the second adopts any child that
 * nobody reached. A stranded node would be drawn on screen as an option and
 * then never be reachable, which in a game with no error messages is simply
 * an icon that lies.
 */
export function generateMap(rng: Rng): NodeMap {
  const nodes: MapNode[] = [];
  const rows: MapNode[][] = [];
  let nextId = 0;

  for (let row = 0; row < MAP_ROWS; row += 1) {
    const width = row === 0 || row === MAP_ROWS - 1 ? 1 : randInt(rng, 2, MAX_ROW_WIDTH);
    const kinds = kindsForRow(row, width, rng);
    const rowNodes = kinds.map((kind, col) => ({
      id: nextId++,
      row,
      col,
      kind,
      tier: tierForRow(row),
      next: [] as number[],
    }));
    rows.push(rowNodes);
    nodes.push(...rowNodes);
  }

  for (let row = 0; row < MAP_ROWS - 1; row += 1) {
    const upper = rows[row];
    const lower = rows[row + 1];

    for (const node of upper) {
      // Aim at the child sitting roughly beneath, so the drawn lines slope
      // gently instead of crossing the whole map.
      const beneath = Math.min(lower.length - 1, Math.round((node.col / Math.max(1, upper.length - 1)) * (lower.length - 1)));
      node.next.push(lower[beneath].id);

      if (lower.length > 1 && chance(rng, 0.45)) {
        const sideways = beneath + (chance(rng, 0.5) ? -1 : 1);
        const neighbour = lower[Math.max(0, Math.min(lower.length - 1, sideways))];
        if (!node.next.includes(neighbour.id)) {
          node.next.push(neighbour.id);
        }
      }
    }

    const reached = new Set(upper.flatMap((node) => node.next));
    for (const orphan of lower) {
      if (!reached.has(orphan.id)) {
        const parent = pick(rng, upper);
        parent.next.push(orphan.id);
      }
    }

    for (const node of upper) {
      node.next.sort((a, b) => a - b);
    }
  }

  return { nodes, startId: rows[0][0].id, bossId: rows[MAP_ROWS - 1][0].id };
}
