import type { CubeState } from '../../cube-model/state';
import { Emitter, rotateUUntil } from '../emitter';
import { edgeHome, edgeRef, edgeSlot } from '../recognition';
import { EDGE_COLOR } from '../../facelets/facelets';
import type { Face } from '../../cube-model/moves';
import { StageCapError, type Stage } from '../types';
import { WHITE_EDGES, U_SLOT_OF_FACE } from './daisy';

export const CROSS_MOVE_CAP = 32;
const NON_WHITE_STICKER_INDEX = 1;

export function crossDone(s: CubeState): boolean {
  return WHITE_EDGES.every((c) => edgeHome(s, c));
}

export function solveCross(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, CROSS_MOVE_CAP, 'Cross');
  for (const cubie of WHITE_EDGES) {
    if (edgeHome(e.state, cubie)) continue;
    // The edge's non-white color identifies its home side face (e.g. DR's non-white is R).
    const side = EDGE_COLOR[cubie][NON_WHITE_STICKER_INDEX] as Face;
    const destSlot = U_SLOT_OF_FACE[side];
    if (destSlot === undefined) throw new StageCapError('Cross', `no U slot for side ${side}`);
    e.action(
      'Spin the top so this petal lines up with its matching side center, then drop it down with a double turn.',
      [edgeRef(cubie)],
      () => {
        rotateUUntil(e, (s) => edgeSlot(s, cubie) === destSlot);
        e.do(`${side}2`);
      },
    );
  }
  return { stage: e.toStage(), state: e.state };
}
