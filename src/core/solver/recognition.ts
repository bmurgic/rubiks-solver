import type { CubeState } from '../cube-model/state';
import {
  CORNER_COLOR,
  CORNER_FACES,
  EDGE_COLOR,
  EDGE_FACES,
  type FaceName,
} from '../facelets/facelets';

const EDGE_STICKERS = 2;
const CORNER_STICKERS = 3;

export function edgeSlot(s: CubeState, cubie: number): number {
  return s.ep.indexOf(cubie);
}

export function cornerSlot(s: CubeState, cubie: number): number {
  return s.cp.indexOf(cubie);
}

/** Color showing on `face` at edge `slot`, or null if that slot doesn't touch the face. */
export function edgeSticker(s: CubeState, slot: number, face: FaceName): FaceName | null {
  for (let k = 0; k < EDGE_STICKERS; k++) {
    if (EDGE_FACES[slot][(k + s.eo[slot]) % EDGE_STICKERS] === face) {
      return EDGE_COLOR[s.ep[slot]][k];
    }
  }
  return null;
}

/** Color showing on `face` at corner `slot`, or null if that slot doesn't touch the face. */
export function cornerSticker(s: CubeState, slot: number, face: FaceName): FaceName | null {
  for (let k = 0; k < CORNER_STICKERS; k++) {
    if (CORNER_FACES[slot][(k + s.co[slot]) % CORNER_STICKERS] === face) {
      return CORNER_COLOR[s.cp[slot]][k];
    }
  }
  return null;
}

/** The face the WHITE sticker of a white (D-color) edge currently faces. */
export function whiteEdgeFace(s: CubeState, slot: number): FaceName {
  // White is sticker k=0 of D-edges; its face is EDGE_FACES[slot] under current eo.
  return EDGE_FACES[slot][s.eo[slot]];
}
