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

export function apply(state: CubeState, m: Move): CubeState {
  let s = state;
  for (let i = 0; i < m.turns; i++) s = applyTable(s, TABLES[m.face]);
  return s;
}

export function applyAll(state: CubeState, moves: readonly Move[]): CubeState {
  return moves.reduce(apply, state);
}
