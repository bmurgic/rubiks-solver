import type { CubeState } from '../../cube-model/state';
import { Corner, Edge } from '../../cube-model/state';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { cornerSticker, edgeSticker } from '../recognition';
import { StageCapError, type Stage } from '../types';

export const OLL_MOVE_CAP = 120;
export const OLL_EDGE_GUARD = 6;
export const OLL_CORNER_GUARD = 8;

const U_EDGE_SLOTS = [Edge.UR, Edge.UF, Edge.UL, Edge.UB] as const;
const U_CORNER_SLOTS = [Corner.URF, Corner.UFL, Corner.ULB, Corner.UBR] as const;

// 2-look OLL primitives.
// Look 1 (edges): FRURUF flips an L-shape into the cross; running it on a dot
// state with no oriented edges produces a line or L the next iteration.
const F_SEXY_F = "F R U R' U' F'"; // dot → line/L, line (horizontal) → cross
const F_SEXY_PRIME_F = "F U R U' R' F'"; // L (UB+UL oriented) → cross
// Look 2 (corners): Sune handles all four oriented-corner counts (0/1/2)
// once anchored at UFL by the count-specific positioning rules below.
const SUNE = "R U R' U R U2 R'";

const edgeUp = (s: CubeState, slot: number): boolean => edgeSticker(s, slot, 'U') === 'U';
const cornerUp = (s: CubeState, slot: number): boolean => cornerSticker(s, slot, 'U') === 'U';

export function ollDone(s: CubeState): boolean {
  return (
    U_EDGE_SLOTS.every((sl) => edgeUp(s, sl)) && U_CORNER_SLOTS.every((sl) => cornerUp(s, sl))
  );
}

const orientedEdgeCount = (s: CubeState): number =>
  U_EDGE_SLOTS.filter((sl) => edgeUp(s, sl)).length;

const orientedCornerCount = (s: CubeState): number =>
  U_CORNER_SLOTS.filter((sl) => cornerUp(s, sl)).length;

const isOppositeEdgePair = (s: CubeState): boolean =>
  (edgeUp(s, Edge.UR) && edgeUp(s, Edge.UL)) || (edgeUp(s, Edge.UF) && edgeUp(s, Edge.UB));

function orientEdges(e: Emitter): void {
  // Three OLL edge cases: dot (0 oriented), L or line (2 oriented), cross (4).
  // Dot → run line alg once to get to L/line; L → run L alg; line → run line alg.
  for (let guard = 0; guard < OLL_EDGE_GUARD; guard++) {
    const count = orientedEdgeCount(e.state);
    if (count === 4) return;
    if (count === 0) {
      // Dot: any U setup works — F R U R' U' F' produces an L which the next
      // iteration will resolve.
      e.do(F_SEXY_F);
      continue;
    }
    if (count === 2) {
      if (isOppositeEdgePair(e.state)) {
        // Line: rotate until the line lies horizontal (UR + UL oriented).
        rotateUUntil(e, (s) => edgeUp(s, Edge.UR) && edgeUp(s, Edge.UL));
        e.do(F_SEXY_F);
      } else {
        // L shape: rotate until the L sits at UB + UL (back/left oriented).
        rotateUUntil(e, (s) => edgeUp(s, Edge.UB) && edgeUp(s, Edge.UL));
        e.do(F_SEXY_PRIME_F);
      }
      continue;
    }
    // Unreachable by construction: a valid cube under Kociemba EO has an even
    // number of oriented U-edges, so count ∈ {0, 2, 4} only.
    throw new StageCapError('OLL', `impossible oriented-edge count ${count}`);
  }
  throw new StageCapError('OLL', 'edge orientation did not converge');
}

function orientCorners(e: Emitter): void {
  // Sune-only 2-look corner OLL. Anchor positioning rules at UFL:
  //   1 oriented → put the lone oriented corner at UFL
  //   0 oriented → put a corner whose U-sticker faces L at UFL ("headlights left")
  //   2 oriented → put a corner whose U-sticker faces F at UFL
  for (let guard = 0; guard < OLL_CORNER_GUARD; guard++) {
    const count = orientedCornerCount(e.state);
    if (count === 4) return;
    if (count === 1) {
      rotateUUntil(e, (s) => cornerUp(s, Corner.UFL));
    } else if (count === 0) {
      rotateUUntil(e, (s) => cornerSticker(s, Corner.UFL, 'L') === 'U');
    } else {
      // count === 2
      rotateUUntil(e, (s) => cornerSticker(s, Corner.UFL, 'F') === 'U');
    }
    e.do(SUNE);
  }
  throw new StageCapError('OLL', 'corner orientation did not converge');
}

export function solveOll(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, OLL_MOVE_CAP, 'OLL');
  orientEdges(e);
  orientCorners(e);
  if (!ollDone(e.state)) {
    // Unreachable by construction: both look-helpers throw on non-convergence.
    throw new StageCapError('OLL', 'did not converge');
  }
  return { stage: { name: 'OLL', moves: cleanup(e.moves) }, state: e.state };
}
