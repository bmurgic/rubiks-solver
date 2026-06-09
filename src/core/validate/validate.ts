import type { CubeState } from '../cube-model/state';

const NUM_CORNERS = 8;
const NUM_EDGES = 12;
const TWIST_MOD = 3;
const FLIP_MOD = 2;
const MIN_TWIST = 0;
const MAX_TWIST = 2;
const MIN_FLIP = 0;
const MAX_FLIP = 1;

export type Invariant = 'structure' | 'twist' | 'flip' | 'parity';

export class UnsolvableCubeError extends Error {
  readonly invariant: Invariant;
  constructor(invariant: Invariant) {
    super(`Cube state is unsolvable: ${invariant} invariant violated`);
    this.name = 'UnsolvableCubeError';
    this.invariant = invariant;
  }
}

function parity(p: readonly number[]): number {
  let inv = 0;
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      if (p[i] > p[j]) inv++;
    }
  }
  return inv % 2;
}

function isPermutation(p: readonly number[], n: number): boolean {
  if (p.length !== n) return false;
  const sorted = [...p].sort((a, b) => a - b);
  return sorted.every((v, i) => v === i);
}

/**
 * Verify a cube state belongs to the reachable space — i.e. it could have
 * arisen from a sequence of face turns on the solved state.
 *
 * Checks four invariants in order: structure (valid permutations and
 * twist/flip ranges), corner twist sum mod 3, edge flip sum mod 2, and
 * corner/edge permutation parity agreement.
 *
 * @param s The cube state to validate.
 * @throws {UnsolvableCubeError} If any invariant is violated. The error's
 *   `invariant` field names which one.
 */
export function assertSolvable(s: CubeState): void {
  const cornerStructureOk =
    isPermutation(s.cp, NUM_CORNERS) && s.co.length === NUM_CORNERS &&
    s.co.every((v) => v >= MIN_TWIST && v <= MAX_TWIST);
  const edgeStructureOk =
    isPermutation(s.ep, NUM_EDGES) && s.eo.length === NUM_EDGES &&
    s.eo.every((v) => v >= MIN_FLIP && v <= MAX_FLIP);
  if (!cornerStructureOk || !edgeStructureOk) {
    throw new UnsolvableCubeError('structure');
  }
  if (s.co.reduce((a, b) => a + b, 0) % TWIST_MOD !== 0) {
    throw new UnsolvableCubeError('twist');
  }
  if (s.eo.reduce((a, b) => a + b, 0) % FLIP_MOD !== 0) {
    throw new UnsolvableCubeError('flip');
  }
  if (parity(s.cp) !== parity(s.ep)) {
    throw new UnsolvableCubeError('parity');
  }
}
