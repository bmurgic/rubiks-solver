import type { CubeState } from '../../cube-model/state';
import { Edge } from '../../cube-model/state';
import type { Face } from '../../cube-model/moves';
import { Emitter, rotateUUntil } from '../emitter';
import { edgeRef, edgeSlot, whiteEdgeFace } from '../recognition';
import { StageCapError, type Stage } from '../types';

export const DAISY_MOVE_CAP = 60;
export const PLACE_EDGE_GUARD = 6;
export const DAISY_CONVERGE_GUARD = 8;
const U_LAYER_MAX_SLOT = 3;
const D_LAYER_MAX_SLOT = 7;

export const WHITE_EDGES = [Edge.DR, Edge.DF, Edge.DL, Edge.DB] as const;

/** Side face → corresponding U-layer slot (its "petal" slot). */
export const U_SLOT_OF_FACE: Partial<Record<Face, number>> = {
  R: Edge.UR,
  F: Edge.UF,
  L: Edge.UL,
  B: Edge.UB,
};

/** D-layer slot → side face the slot touches. */
const D_SLOT_SIDE: Record<number, Face> = {
  [Edge.DR]: 'R',
  [Edge.DF]: 'F',
  [Edge.DL]: 'L',
  [Edge.DB]: 'B',
};

/**
 * E-layer lift: slot → (face the white sticker shows → notation string that
 * lifts the edge into the U layer with white pointing up).
 * The first char of the string is the rotated face; we protect that face's
 * U slot before applying the lift.
 */
const E_LIFT: Record<number, Partial<Record<Face, string>>> = {
  [Edge.FR]: { F: 'R', R: "F'" },
  [Edge.FL]: { F: "L'", L: 'F' },
  [Edge.BL]: { B: 'L', L: "B'" },
  [Edge.BR]: { B: "R'", R: 'B' },
};

function isPetalAt(s: CubeState, uSlot: number): boolean {
  const cubie = s.ep[uSlot];
  return (WHITE_EDGES as readonly number[]).includes(cubie) && whiteEdgeFace(s, uSlot) === 'U';
}

function isPlaced(s: CubeState, cubie: number): boolean {
  const slot = edgeSlot(s, cubie);
  return slot <= U_LAYER_MAX_SLOT && whiteEdgeFace(s, slot) === 'U';
}

export function daisyDone(s: CubeState): boolean {
  return WHITE_EDGES.every((c) => isPlaced(s, c));
}

function placeFromULayer(e: Emitter, slot: number): 'done' | 'continue' {
  const white = whiteEdgeFace(e.state, slot);
  if (white === 'U') return 'done';
  // White faces a side — drop into E layer through that side face.
  e.action('This petal is flipped — push it out into the middle layer.', [edgeRef(e.state.ep[slot])], () =>
    e.do(white),
  );
  return 'continue';
}

function placeFromDLayer(e: Emitter, slot: number): 'done' | 'continue' {
  const side = D_SLOT_SIDE[slot];
  const white = whiteEdgeFace(e.state, slot);
  if (white === 'D') {
    // Two-turn flip: rotate U so destination petal is free, then side2.
    const destSlot = U_SLOT_OF_FACE[side];
    if (destSlot === undefined) throw new StageCapError('Daisy', `no U slot for side ${side}`);
    e.action(
      'A white edge points down — spin the top to free its petal spot, then flip it up with a double turn.',
      [edgeRef(e.state.ep[slot])],
      () => {
        rotateUUntil(e, (s) => !isPetalAt(s, destSlot));
        e.do(`${side}2`);
      },
    );
    return 'done';
  }
  // White on side — single side turn moves it to the E layer.
  e.action(
    'A bottom edge shows white sideways — turn that side to send it into the middle layer.',
    [edgeRef(e.state.ep[slot])],
    () => e.do(side),
  );
  return 'continue';
}

function placeFromELayer(e: Emitter, slot: number): 'done' {
  const white = whiteEdgeFace(e.state, slot);
  const liftTable = E_LIFT[slot];
  const lift = liftTable?.[white as Face];
  if (lift === undefined) throw new StageCapError('Daisy', `no E-lift for slot ${slot}/${white}`);
  const destFace = lift[0] as Face;
  const destSlot = U_SLOT_OF_FACE[destFace];
  if (destSlot === undefined) throw new StageCapError('Daisy', `no U slot for face ${destFace}`);
  e.action('Make room on top, then lift the white edge up into the daisy.', [edgeRef(e.state.ep[slot])], () => {
    rotateUUntil(e, (s) => !isPetalAt(s, destSlot));
    e.do(lift);
  });
  return 'done';
}

function placeEdge(e: Emitter, cubie: number): void {
  for (let guard = 0; guard < PLACE_EDGE_GUARD; guard++) {
    const slot = edgeSlot(e.state, cubie);
    const status =
      slot <= U_LAYER_MAX_SLOT ? placeFromULayer(e, slot)
      : slot <= D_LAYER_MAX_SLOT ? placeFromDLayer(e, slot)
      : placeFromELayer(e, slot);
    if (status === 'done') return;
  }
  throw new StageCapError('Daisy', `edge ${cubie} did not place`);
}

export function solveDaisy(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, DAISY_MOVE_CAP, 'Daisy');
  for (let guard = 0; guard < DAISY_CONVERGE_GUARD && !daisyDone(e.state); guard++) {
    const next = WHITE_EDGES.find((c) => !isPlaced(e.state, c));
    if (next === undefined) break;
    placeEdge(e, next);
  }
  if (!daisyDone(e.state)) throw new StageCapError('Daisy', 'did not converge');
  return { stage: e.toStage(), state: e.state };
}
