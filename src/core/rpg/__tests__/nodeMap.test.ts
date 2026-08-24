import { describe, expect, it } from 'vitest';
import { MAP_ROWS, MAX_ROW_WIDTH, generateMap, nodeAt, optionsFrom, tierForRow } from '../nodeMap';
import type { NodeMap } from '../nodeMap';
import { createRng } from '../rng';

const map = (seed = 1): NodeMap => generateMap(createRng(seed));

const rowNodes = (m: NodeMap, row: number) => m.nodes.filter((n) => n.row === row);

describe('generateMap', () => {
  it('runs from a single start to a single boss', () => {
    const m = map();
    expect(rowNodes(m, 0)).toHaveLength(1);
    expect(rowNodes(m, MAP_ROWS - 1)).toHaveLength(1);
    expect(nodeAt(m, m.startId)?.kind).toBe('start');
    expect(nodeAt(m, m.bossId)?.kind).toBe('boss');
  });

  it('fills every row, and never wider than the screen holds', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const m = map(seed);
      for (let row = 0; row < MAP_ROWS; row += 1) {
        const width = rowNodes(m, row).length;
        expect(width).toBeGreaterThanOrEqual(1);
        expect(width).toBeLessThanOrEqual(MAX_ROW_WIDTH);
      }
    }
  });

  it('only ever steps to the next row down', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const m = map(seed);
      for (const node of m.nodes) {
        for (const next of node.next) {
          expect(nodeAt(m, next)!.row).toBe(node.row + 1);
        }
      }
    }
  });

  it('leaves no node stranded — everything is walked into and out of', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const m = map(seed);
      const incoming = new Set(m.nodes.flatMap((n) => n.next));
      for (const node of m.nodes) {
        if (node.id !== m.startId) {
          expect(incoming.has(node.id)).toBe(true);
        }
        if (node.id !== m.bossId) {
          expect(node.next.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('can be walked from the start to the boss whichever way you turn', () => {
    // Every reachable node must still lead somewhere, so no choice is a
    // dead end the player only discovers after committing to it.
    for (let seed = 0; seed < 25; seed += 1) {
      const m = map(seed);
      let frontier = [m.startId];
      for (let row = 0; row < MAP_ROWS - 1; row += 1) {
        expect(frontier.length).toBeGreaterThan(0);
        frontier = [...new Set(frontier.flatMap((id) => nodeAt(m, id)!.next))];
      }
      expect(frontier).toEqual([m.bossId]);
    }
  });

  it('opens with a plain fight, so the first lesson is the simplest one', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      for (const node of rowNodes(map(seed), 1)) {
        expect(node.kind).toBe('battle');
      }
    }
  });

  it('always offers a bed on the way to the boss', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      for (const node of rowNodes(map(seed), MAP_ROWS - 2)) {
        expect(node.kind).toBe('rest');
      }
    }
  });

  it('puts a fight in every middle row, so no route dodges the campaign', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const m = map(seed);
      for (let row = 2; row < MAP_ROWS - 2; row += 1) {
        const kinds = rowNodes(m, row).map((n) => n.kind);
        expect(kinds.some((kind) => kind === 'battle' || kind === 'elite')).toBe(true);
      }
    }
  });

  it('keeps most of the run a fight rather than a shopping trip', () => {
    let fights = 0;
    let total = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      for (const node of map(seed).nodes) {
        if (node.kind === 'start' || node.kind === 'boss') {
          continue;
        }
        total += 1;
        if (node.kind === 'battle' || node.kind === 'elite') {
          fights += 1;
        }
      }
    }
    expect(fights / total).toBeGreaterThan(0.5);
  });

  it('offers every kind of node somewhere across a spread of maps', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed += 1) {
      for (const node of map(seed).nodes) {
        kinds.add(node.kind);
      }
    }
    expect(kinds).toEqual(new Set(['start', 'battle', 'elite', 'rest', 'treasure', 'shrine', 'boss']));
  });

  it('is reproducible from a seed, and different between seeds', () => {
    const shape = (m: NodeMap) => m.nodes.map((n) => `${n.row}:${n.kind}:${n.next.join('/')}`).join('|');
    expect(shape(map(5))).toBe(shape(map(5)));
    expect(shape(map(5))).not.toBe(shape(map(6)));
  });
});

describe('tierForRow', () => {
  it('deepens as the map climbs, and tops out at the boss', () => {
    expect(tierForRow(1)).toBe(1);
    expect(tierForRow(MAP_ROWS - 1)).toBe(4);
    for (let row = 2; row < MAP_ROWS - 1; row += 1) {
      expect(tierForRow(row)).toBeGreaterThanOrEqual(tierForRow(row - 1));
    }
  });

  it('gives every tier a decent stretch of the map', () => {
    const rows = Array.from({ length: MAP_ROWS - 2 }, (_, i) => tierForRow(i + 1));
    for (const tier of [1, 2, 3]) {
      expect(rows.filter((t) => t === tier).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('optionsFrom', () => {
  it('offers exactly what the current node leads to', () => {
    const m = map();
    const options = optionsFrom(m, m.startId);
    expect(options.map((n) => n.id)).toEqual(nodeAt(m, m.startId)!.next);
  });

  it('offers nothing beyond the boss', () => {
    const m = map();
    expect(optionsFrom(m, m.bossId)).toEqual([]);
  });
});
