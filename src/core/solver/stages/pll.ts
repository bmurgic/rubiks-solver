import type { CubeState } from '../../cube-model/state';
import { Corner, Edge, isSolved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { parse } from '../../notation/notation';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { cornerSticker } from '../recognition';
import { StageCapError, type Stage } from '../types';

export const PLL_MOVE_CAP = 160;
export const PLL_CORNER_GUARD = 4;
export const PLL_EDGE_GUARD = 6;

// 2-look PLL primitives.
// T-perm: swaps the two RIGHT-side U-corners (URF↔UBR) AND swaps UL↔UR edges.
// Headlights (matching color pair on a side face) end up on the LEFT after the
// swap, which is why the look-1 driver rotates them to the LEFT before firing.
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";
// U-perms: 3-cycle of UF/UL/UR edges with UB fixed. Ua and Ub cycle in
// opposite directions; the driver picks which by simulation.
const U_PERM_A = "R U' R U R U R U' R' U' R2";
const U_PERM_B = "R2 U R U R' U' R' U' R' U R'";

const U_CORNER_SLOTS = [Corner.URF, Corner.UFL, Corner.ULB, Corner.UBR] as const;
const U_EDGE_SLOTS = [Edge.UR, Edge.UF, Edge.UL, Edge.UB] as const;

type SideFace = 'F' | 'R' | 'B' | 'L';
const SIDE_FACES: readonly SideFace[] = ['F', 'R', 'B', 'L'];

// The two U-corner slots that form the "headlights" pair on each side face,
// in (left-when-facing, right-when-facing) order.
const FACE_CORNERS: Record<SideFace, readonly [number, number]> = {
  F: [Corner.UFL, Corner.URF],
  R: [Corner.URF, Corner.UBR],
  B: [Corner.UBR, Corner.ULB],
  L: [Corner.ULB, Corner.UFL],
};

// Order of U-edge slots cycled by a single U turn: U sends UB→UR→UF→UL→UB.
const U_TURN_ORDER: readonly number[] = [Edge.UB, Edge.UR, Edge.UF, Edge.UL];
const U_CYCLE_LENGTH = 4;

function headlightsOn(s: CubeState, f: SideFace): boolean {
  const [a, b] = FACE_CORNERS[f];
  return cornerSticker(s, a, f) === cornerSticker(s, b, f);
}

function cornersHome(s: CubeState): boolean {
  return U_CORNER_SLOTS.every((sl) => s.cp[sl] === sl && s.co[sl] === 0);
}

/** True iff the four U-corners are permuted correctly up to some U rotation. */
function cornersPermutedUpToU(s: CubeState): boolean {
  let t = s;
  for (let k = 0; k < U_CYCLE_LENGTH; k++) {
    if (cornersHome(t)) return true;
    t = applyAll(t, parse('U'));
  }
  return false;
}

/** Number of U turns that carries the U-edge at `from` to slot UB. */
function uTurnsToUB(from: number): number {
  return (U_CYCLE_LENGTH - U_TURN_ORDER.indexOf(from)) % U_CYCLE_LENGTH;
}

function permuteCorners(e: Emitter): void {
  // Look 1: drive corners to a correct cycle up to AUF using T-perm.
  // Aim headlights LEFT (T-perm swaps the right pair). If no headlights exist,
  // a single T-perm creates them, so the next iteration can finish the job.
  for (let guard = 0; guard < PLL_CORNER_GUARD; guard++) {
    if (cornersPermutedUpToU(e.state)) return;
    const anyHeadlights = SIDE_FACES.some((f) => headlightsOn(e.state, f));
    if (anyHeadlights) rotateUUntil(e, (s) => headlightsOn(s, 'L'));
    e.do(T_PERM);
  }
  throw new StageCapError('PLL', 'corner permutation did not converge');
}

/** Count how many U-edge slots end up home under some U-rotation of `s`, assuming corners are also home. */
function homeEdgesUnderSomeAuf(s: CubeState): number {
  let best = 0;
  let t = s;
  for (let k = 0; k < U_CYCLE_LENGTH; k++) {
    if (cornersHome(t)) {
      const home = U_EDGE_SLOTS.filter((sl) => t.ep[sl] === sl).length;
      if (home > best) best = home;
    }
    t = applyAll(t, parse('U'));
  }
  return best;
}

function permuteEdges(e: Emitter): void {
  // Look 2: cycle the three non-fixed U-edges with U-perms (corners stay fixed).
  for (let guard = 0; guard < PLL_EDGE_GUARD; guard++) {
    if (isSolved(e.state)) return;
    const home = U_EDGE_SLOTS.filter((sl) => e.state.ep[sl] === sl);
    if (home.length === U_CYCLE_LENGTH) return;
    // H/Z case (no edges home): a single U-perm leaves a 3-cycle for next pass.
    if (home.length === 0) {
      e.do(U_PERM_A);
      continue;
    }
    // Exactly one edge home: park it at UB, then pick Ua/Ub by simulating both.
    const turns = uTurnsToUB(home[0]);
    if (turns > 0) e.do(Array<string>(turns).fill('U').join(' '));
    const tryA = applyAll(e.state, parse(U_PERM_A));
    const aFixes = homeEdgesUnderSomeAuf(tryA);
    e.do(aFixes === U_CYCLE_LENGTH ? U_PERM_A : U_PERM_B);
    rotateUUntil(e, cornersHome); // AUF / realign after the cycle.
  }
  throw new StageCapError('PLL', 'did not converge');
}

export function solvePll(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, PLL_MOVE_CAP, 'PLL');
  permuteCorners(e);
  // Align corners home; also serves as AUF as edges finish.
  rotateUUntil(e, cornersHome);
  permuteEdges(e);
  if (!isSolved(e.state)) {
    // Unreachable by construction: permuteEdges throws on non-convergence.
    throw new StageCapError('PLL', 'did not converge');
  }
  return { stage: { name: 'PLL', moves: cleanup(e.moves) }, state: e.state };
}
