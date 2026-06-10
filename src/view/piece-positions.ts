import type { CubeState } from '../core/cube-model/state';
import type { PieceRef } from '../core/solver/types';
import type { Vec3 } from './facelet-grid';

// Axis convention (matches CubeView): U=+y, D=-y, R=+x, L=-x, F=+z, B=-z.

/** Index = edge slot id (Edge.*): UR UF UL UB DR DF DL DB FR FL BL BR. */
export const EDGE_SLOT_POS: readonly Vec3[] = [
  [1, 1, 0],
  [0, 1, 1],
  [-1, 1, 0],
  [0, 1, -1],
  [1, -1, 0],
  [0, -1, 1],
  [-1, -1, 0],
  [0, -1, -1],
  [1, 0, 1],
  [-1, 0, 1],
  [-1, 0, -1],
  [1, 0, -1],
];

/** Index = corner slot id (Corner.*): URF UFL ULB UBR DFR DLF DBL DRB. */
export const CORNER_SLOT_POS: readonly Vec3[] = [
  [1, 1, 1],
  [-1, 1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, -1, -1],
  [1, -1, -1],
];

/**
 * Grid positions of the cubelets currently holding the target pieces.
 * Finds each cubie's slot in the live state, then maps slot to position.
 */
export function targetPositions(state: CubeState, targets: readonly PieceRef[]): Vec3[] {
  return targets.map((t) =>
    t.kind === 'edge'
      ? EDGE_SLOT_POS[state.ep.indexOf(t.piece)]
      : CORNER_SLOT_POS[state.cp.indexOf(t.piece)],
  );
}
