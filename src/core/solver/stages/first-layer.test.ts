import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';
import { solveFirstLayer, firstLayerDone } from './first-layer';

test('first layer + cross intact after stage, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const s1 = solveCross(solveDaisy(start).state).state;
    const { stage, state } = solveFirstLayer(s1);
    expect(firstLayerDone(state)).toBe(true);
    expect(crossDone(state)).toBe(true); // prior stage intact
    expect(applyAll(s1, stage.moves)).toEqual(state);
  }
});
