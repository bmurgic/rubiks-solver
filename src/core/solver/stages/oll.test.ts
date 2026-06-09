import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';
import { solveFirstLayer, firstLayerDone } from './first-layer';
import { solveSecondLayer, secondLayerDone } from './second-layer';
import { solveOll, ollDone } from './oll';

test('OLL done, lower layers intact, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const s3 = solveSecondLayer(solveFirstLayer(solveCross(solveDaisy(start).state).state).state).state;
    const { stage, state } = solveOll(s3);
    expect(ollDone(state)).toBe(true);
    expect(secondLayerDone(state) && firstLayerDone(state) && crossDone(state)).toBe(true);
    expect(applyAll(s3, stage.moves)).toEqual(state);
  }
});
