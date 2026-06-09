import { FACE_ORDER, type FaceName } from '../core/facelets/facelets';

export type Vec3 = readonly [number, number, number];

const STICKERS_PER_FACE = 9;
const FACE_DIM = 3;

// (r, c) within a face from grid coords x,y,z in {-1,0,1}.
const RC: Record<FaceName, (x: number, y: number, z: number) => [number, number]> = {
  U: (x, _y, z) => [z + 1, x + 1],
  R: (_x, y, z) => [1 - y, 1 - z],
  F: (x, y) => [1 - y, x + 1],
  D: (x, _y, z) => [1 - z, x + 1],
  L: (_x, y, z) => [1 - y, z + 1],
  B: (x, y) => [1 - y, 1 - x],
};

const NORMAL_FACE: ReadonlyArray<{ n: Vec3; face: FaceName }> = [
  { n: [0, 1, 0], face: 'U' },
  { n: [1, 0, 0], face: 'R' },
  { n: [0, 0, 1], face: 'F' },
  { n: [0, -1, 0], face: 'D' },
  { n: [-1, 0, 0], face: 'L' },
  { n: [0, 0, -1], face: 'B' },
];

function normalsEqual(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function lookupFace(normal: Vec3): { n: Vec3; face: FaceName } | undefined {
  return NORMAL_FACE.find(({ n }) => normalsEqual(n, normal));
}

function isOnSurface(pos: Vec3, normal: Vec3): boolean {
  const [x, y, z] = pos;
  return (
    (normal[0] !== 0 && x === normal[0]) ||
    (normal[1] !== 0 && y === normal[1]) ||
    (normal[2] !== 0 && z === normal[2])
  );
}

export function faceletIndexAt(pos: Vec3, normal: Vec3): number | null {
  const hit = lookupFace(normal);
  if (!hit) return null;
  if (!isOnSurface(pos, hit.n)) return null;
  const [x, y, z] = pos;
  const [r, c] = RC[hit.face](x, y, z);
  return FACE_ORDER.indexOf(hit.face) * STICKERS_PER_FACE + r * FACE_DIM + c;
}
