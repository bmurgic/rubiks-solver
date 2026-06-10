import { describe, expect, it } from 'vitest';
import { solved, Corner, Edge } from '../core/cube-model/state';
import { apply } from '../core/cube-model/apply';
import { parse } from '../core/notation/notation';
import { CORNER_SLOT_POS, EDGE_SLOT_POS, targetPositions } from './piece-positions';

describe('slot position tables', () => {
  it('covers all 12 edge slots with distinct surface positions', () => {
    expect(EDGE_SLOT_POS).toHaveLength(12);
    expect(new Set(EDGE_SLOT_POS.map((p) => p.join(',')))).toHaveProperty('size', 12);
    // An edge position has exactly one zero coordinate.
    for (const p of EDGE_SLOT_POS) {
      expect(p.filter((c) => c === 0)).toHaveLength(1);
      expect(p.every((c) => c === -1 || c === 0 || c === 1)).toBe(true);
    }
  });

  it('covers all 8 corner slots with distinct corner positions', () => {
    expect(CORNER_SLOT_POS).toHaveLength(8);
    expect(new Set(CORNER_SLOT_POS.map((p) => p.join(',')))).toHaveProperty('size', 8);
    // A corner position has no zero coordinate.
    for (const p of CORNER_SLOT_POS) {
      expect(p.every((c) => c === -1 || c === 1)).toBe(true);
    }
  });

  it('maps named slots to the axis convention (U=+y, R=+x, F=+z)', () => {
    expect(EDGE_SLOT_POS[Edge.UF]).toEqual([0, 1, 1]);
    expect(EDGE_SLOT_POS[Edge.FR]).toEqual([1, 0, 1]);
    expect(EDGE_SLOT_POS[Edge.DB]).toEqual([0, -1, -1]);
    expect(CORNER_SLOT_POS[Corner.URF]).toEqual([1, 1, 1]);
    expect(CORNER_SLOT_POS[Corner.DBL]).toEqual([-1, -1, -1]);
  });
});

describe('targetPositions', () => {
  it('resolves pieces at home on the solved cube', () => {
    const got = targetPositions(solved(), [
      { kind: 'edge', piece: Edge.UF },
      { kind: 'corner', piece: Corner.URF },
    ]);
    expect(got).toEqual([
      [0, 1, 1],
      [1, 1, 1],
    ]);
  });

  it('follows a piece displaced by a move', () => {
    // R turn keeps R-face pieces on the R face but moves them off their home slots.
    const s = apply(solved(), parse('R')[0]);
    const [pos] = targetPositions(s, [{ kind: 'edge', piece: Edge.UR }]);
    expect(pos[0]).toBe(1); // still on the R face (x === 1)
    expect(pos.join(',')).not.toBe(EDGE_SLOT_POS[Edge.UR].join(',')); // no longer at home
  });

  it('returns an empty array for empty targets', () => {
    expect(targetPositions(solved(), [])).toEqual([]);
  });
});
