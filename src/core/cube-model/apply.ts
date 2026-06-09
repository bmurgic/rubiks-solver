import type { CubeState } from './state';
import type { Move } from './moves';
import { TABLES, type MoveTable } from './tables';

const CO_MOD = 3;
const EO_MOD = 2;

function applyTable(s: CubeState, t: MoveTable): CubeState {
  return {
    cp: t.cp.map((src) => s.cp[src]),
    co: t.cp.map((src, i) => (s.co[src] + t.co[i]) % CO_MOD),
    ep: t.ep.map((src) => s.ep[src]),
    eo: t.ep.map((src, i) => (s.eo[src] + t.eo[i]) % EO_MOD),
  };
}

/**
 * Apply a single move to a cube state, returning a new state.
 *
 * @param state The cube state before the move.
 * @param m The move to apply (face + 1/2/3 quarter turns).
 * @returns A new `CubeState` reflecting the move. `state` is never mutated.
 */
export function apply(state: CubeState, m: Move): CubeState {
  let s = state;
  for (let i = 0; i < m.turns; i++) s = applyTable(s, TABLES[m.face]);
  return s;
}

/**
 * Fold a sequence of moves over a cube state, returning the final state.
 *
 * @param state The cube state before the first move.
 * @param moves Ordered list of moves to apply.
 * @returns A new `CubeState` after applying every move in order.
 */
export function applyAll(state: CubeState, moves: readonly Move[]): CubeState {
  return moves.reduce(apply, state);
}
