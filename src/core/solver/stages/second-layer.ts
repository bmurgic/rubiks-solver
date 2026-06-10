import type { CubeState } from '../../cube-model/state';
import { Edge } from '../../cube-model/state';
import type { Face } from '../../cube-model/moves';
import { Emitter, rotateUUntil } from '../emitter';
import { edgeHome, edgeSlot, edgeSticker } from '../recognition';
import { StageCapError, type Stage } from '../types';
import { U_SLOT_OF_FACE } from './daisy';

export const SECOND_LAYER_MOVE_CAP = 160;
export const SECOND_LAYER_CONVERGE_GUARD = 12;
const E_LAYER_MIN_SLOT = 8;

export const MIDDLE_EDGES = [Edge.FR, Edge.FL, Edge.BL, Edge.BR] as const;

/** Index = U-layer slot (UR, UF, UL, UB) → the side face that slot touches. */
const U_SLOT_SIDE_FACE: readonly Face[] = ['R', 'F', 'L', 'B'];

// Standard tutorial inserts. rightInsert(f, r): edge parked at U-slot-of-f showing its
// f-color on f; inserts into slot f∩r. leftInsert(f, l) mirrors it.
const right = (f: Face, r: Face): string => `U ${r} U' ${r}' U' ${f}' U ${f}`;
const left = (f: Face, l: Face): string => `U' ${l}' U ${l} U ${f} U' ${f}'`;

// Per slot: two cases keyed by WHICH face the side sticker must align with.
const CASES: Record<number, ReadonlyArray<{ alignFace: Face; alg: string }>> = {
  [Edge.FR]: [{ alignFace: 'F', alg: right('F', 'R') }, { alignFace: 'R', alg: left('R', 'F') }],
  [Edge.FL]: [{ alignFace: 'F', alg: left('F', 'L') }, { alignFace: 'L', alg: right('L', 'F') }],
  [Edge.BL]: [{ alignFace: 'B', alg: right('B', 'L') }, { alignFace: 'L', alg: left('L', 'B') }],
  [Edge.BR]: [{ alignFace: 'B', alg: left('B', 'R') }, { alignFace: 'R', alg: right('R', 'B') }],
};

export function secondLayerDone(s: CubeState): boolean {
  return MIDDLE_EDGES.every((c) => edgeHome(s, c));
}

/** Side-facing color of a U-layer edge (the sticker NOT facing up). */
function sideColor(s: CubeState, slot: number): Face {
  const sideFace = U_SLOT_SIDE_FACE[slot];
  // Safe: caller invokes this only for a U-layer slot holding a middle (E-layer)
  // edge cubie. Such a cubie's stickers are both non-U colors, so the sticker
  // on `sideFace` is guaranteed defined.
  return edgeSticker(s, slot, sideFace)! as Face;
}

function ejectFromELayer(e: Emitter, slot: number): void {
  // Stuck in the E layer (wrong slot or flipped): eject by running that slot's
  // first case alg after parking a non-middle edge at its park slot so we
  // don't disturb other already-solved middle edges.
  const c0 = CASES[slot][0];
  const park = U_SLOT_OF_FACE[c0.alignFace];
  if (park === undefined) {
    throw new StageCapError('Second Layer', `no U slot for face ${c0.alignFace}`);
  }
  e.action('This middle edge is in the wrong slot — run the insert to eject it up top.', () => {
    rotateUUntil(e, (s) => !(MIDDLE_EDGES as readonly number[]).includes(s.ep[park]));
    e.do(c0.alg);
  });
}

function insertFromULayer(e: Emitter, cubie: number, slot: number): void {
  const align = sideColor(e.state, slot); // constant under U turns
  const dest = U_SLOT_OF_FACE[align];
  if (dest === undefined) {
    throw new StageCapError('Second Layer', `no U slot for face ${align}`);
  }
  const targetCase = CASES[cubie].find((c) => c.alignFace === align);
  if (!targetCase) {
    throw new StageCapError('Second Layer', `edge ${cubie} has no case for align face ${align}`);
  }
  e.action(
    'Match the edge with its side center, then send it down into its slot with the insert trigger.',
    () => {
      rotateUUntil(e, (s) => edgeSlot(s, cubie) === dest);
      e.do(targetCase.alg);
    },
  );
}

export function solveSecondLayer(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, SECOND_LAYER_MOVE_CAP, 'Second Layer');
  for (let guard = 0; guard < SECOND_LAYER_CONVERGE_GUARD && !secondLayerDone(e.state); guard++) {
    const cubie = MIDDLE_EDGES.find((c) => !edgeHome(e.state, c));
    if (cubie === undefined) break;
    let slot = edgeSlot(e.state, cubie);
    if (slot >= E_LAYER_MIN_SLOT) {
      ejectFromELayer(e, slot);
      slot = edgeSlot(e.state, cubie);
    }
    insertFromULayer(e, cubie, slot);
  }
  if (!secondLayerDone(e.state)) {
    throw new StageCapError('Second Layer', 'did not converge');
  }
  return { stage: e.toStage(), state: e.state };
}
