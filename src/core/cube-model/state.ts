export const Corner = {
  URF: 0,
  UFL: 1,
  ULB: 2,
  UBR: 3,
  DFR: 4,
  DLF: 5,
  DBL: 6,
  DRB: 7,
} as const;

export const Edge = {
  UR: 0,
  UF: 1,
  UL: 2,
  UB: 3,
  DR: 4,
  DF: 5,
  DL: 6,
  DB: 7,
  FR: 8,
  FL: 9,
  BL: 10,
  BR: 11,
} as const;

export interface CubeState {
  readonly cp: readonly number[]; // cp[slot] = corner cubie occupying slot
  readonly co: readonly number[]; // co[slot] = twist 0|1|2 (Kociemba rule)
  readonly ep: readonly number[]; // ep[slot] = edge cubie occupying slot
  readonly eo: readonly number[]; // eo[slot] = flip 0|1 (Kociemba flip rule)
}

const SOLVED_CP: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];
const SOLVED_CO: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const SOLVED_EP: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const SOLVED_EO: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/**
 * Build a fresh solved-cube state — every cubie home, every orientation zero.
 *
 * @returns A new `CubeState` whose `cp`/`ep` are the identity permutations and
 *   `co`/`eo` are all zeros.
 */
export function solved(): CubeState {
  return {
    cp: [...SOLVED_CP],
    co: [...SOLVED_CO],
    ep: [...SOLVED_EP],
    eo: [...SOLVED_EO],
  };
}

/**
 * Test whether `s` equals the solved state — i.e. every cubie is in its home
 * slot with default orientation.
 *
 * @param s The cube state to test.
 * @returns `true` iff `s` is structurally equal to `solved()`.
 */
export function isSolved(s: CubeState): boolean {
  const z = solved();
  return (['cp', 'co', 'ep', 'eo'] as const).every(
    (k) => s[k].length === z[k].length && s[k].every((v, i) => v === z[k][i]),
  );
}
