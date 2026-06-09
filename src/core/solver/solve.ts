import type { CubeState } from '../cube-model/state';
import { assertSolvable } from '../validate/validate';
import type { Stage } from './types';
import { solveDaisy } from './stages/daisy';
import { solveCross } from './stages/cross';
import { solveFirstLayer } from './stages/first-layer';
import { solveSecondLayer } from './stages/second-layer';
import { solveOll } from './stages/oll';
import { solvePll } from './stages/pll';

type StageSolver = (s: CubeState) => { stage: Stage; state: CubeState };

const PIPELINE: readonly StageSolver[] = [
  solveDaisy,
  solveCross,
  solveFirstLayer,
  solveSecondLayer,
  solveOll,
  solvePll,
];

/**
 * Solve `state` using the layer-by-layer pipeline (Daisy → Cross → First
 * Layer → Second Layer → OLL → PLL).
 *
 * @param state The scrambled cube state to solve.
 * @returns The six per-stage move lists. Concatenating them and applying to
 *   `state` yields the solved state.
 * @throws {UnsolvableCubeError} If `state` violates a cube invariant.
 * @throws {StageCapError} If any stage exceeds its move cap or fails to
 *   converge — should never happen for a valid input under the current
 *   pipeline, but is signalled rather than silently looping.
 */
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
