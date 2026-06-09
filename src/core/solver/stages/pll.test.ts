import { expect, test } from 'vitest';
import { isSolved, solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross } from './cross';
import { solveFirstLayer } from './first-layer';
import { solveSecondLayer } from './second-layer';
import { solveOll } from './oll';
import { solvePll } from './pll';

test('PLL fully solves the cube, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const s4 = solveOll(solveSecondLayer(solveFirstLayer(solveCross(solveDaisy(start).state).state).state).state).state;
    const { stage, state } = solvePll(s4);
    expect(isSolved(state)).toBe(true);
    expect(applyAll(s4, stage.moves)).toEqual(state);
  }
});
