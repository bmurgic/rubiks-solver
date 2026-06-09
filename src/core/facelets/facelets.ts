import type { CubeState } from '../cube-model/state';

export type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACE_ORDER: readonly FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];

const STICKERS_PER_FACE = 9;
const CENTER_OFFSET = 4;
const CORNER_STICKERS = 3;
const EDGE_STICKERS = 2;

// Facelet positions (0-53) of the 3 stickers of each corner SLOT, in orientation order.
export const CORNER_FACELET: readonly (readonly number[])[] = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];

// Facelet positions of the 2 stickers of each edge SLOT.
export const EDGE_FACELET: readonly (readonly number[])[] = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];

// Sticker colors of each corner CUBIE, in orientation order.
export const CORNER_COLOR: readonly (readonly FaceName[])[] = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B'],
];

// Sticker colors of each edge CUBIE, in orientation order.
export const EDGE_COLOR: readonly (readonly FaceName[])[] = [
  ['U', 'R'],
  ['U', 'F'],
  ['U', 'L'],
  ['U', 'B'],
  ['D', 'R'],
  ['D', 'F'],
  ['D', 'L'],
  ['D', 'B'],
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'L'],
  ['B', 'R'],
];

// The faces each SLOT touches (same geometry as EDGE_COLOR/CORNER_COLOR read slot-wise).
export const EDGE_FACES = EDGE_COLOR;
export const CORNER_FACES = CORNER_COLOR;

/**
 * Project a cubie-level cube state to a 54-sticker facelet array, ordered
 * U, R, F, D, L, B (nine stickers per face, row-major).
 *
 * @param s The cube state to project.
 * @returns A length-54 array of face-color labels.
 */
export function toFacelets(s: CubeState): FaceName[] {
  const f = new Array<FaceName>(STICKERS_PER_FACE * FACE_ORDER.length);
  // Fixed centers.
  FACE_ORDER.forEach((face, i) => {
    f[i * STICKERS_PER_FACE + CENTER_OFFSET] = face;
  });
  for (let slot = 0; slot < CORNER_FACELET.length; slot++) {
    for (let k = 0; k < CORNER_STICKERS; k++) {
      const orientedSticker = (k + s.co[slot]) % CORNER_STICKERS;
      f[CORNER_FACELET[slot][orientedSticker]] = CORNER_COLOR[s.cp[slot]][k];
    }
  }
  for (let slot = 0; slot < EDGE_FACELET.length; slot++) {
    for (let k = 0; k < EDGE_STICKERS; k++) {
      const orientedSticker = (k + s.eo[slot]) % EDGE_STICKERS;
      f[EDGE_FACELET[slot][orientedSticker]] = EDGE_COLOR[s.ep[slot]][k];
    }
  }
  return f;
}
