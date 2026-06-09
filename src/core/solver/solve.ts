import type { CubeState } from '../cube-model/state';
import { assertSolvable } from '../validate/validate';
import type { Stage } from './types';
import { solveDaisy } from './stages/daisy';
import { solveCross } from './stages/cross';

type StageSolver = (s: CubeState) => { stage: Stage; state: CubeState };

// Tasks 5-8 append: solveFirstLayer, solveSecondLayer, solveOll, solvePll.
const PIPELINE: readonly StageSolver[] = [solveDaisy, solveCross];

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
