import type { CubeState } from '../cube-model/state';
import { assertSolvable } from '../validate/validate';
import type { Stage } from './types';
import { solveDaisy } from './stages/daisy';
import { solveCross } from './stages/cross';
import { solveFirstLayer } from './stages/first-layer';
import { solveSecondLayer } from './stages/second-layer';
import { solveOll } from './stages/oll';

type StageSolver = (s: CubeState) => { stage: Stage; state: CubeState };

// Task 8 appends: solvePll.
const PIPELINE: readonly StageSolver[] = [
  solveDaisy,
  solveCross,
  solveFirstLayer,
  solveSecondLayer,
  solveOll,
];

export function solve(state: CubeState): Stage[] {
  assertSolvable(state);
  const stages: Stage[] = [];
  let s = state;
  for (const stageSolver of PIPELINE) {
    const r = stageSolver(s);
    stages.push(r.stage);
    s = r.state;
  }
  return stages;
}
