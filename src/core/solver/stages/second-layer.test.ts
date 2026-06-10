import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';
import { solveFirstLayer, firstLayerDone } from './first-layer';
import { solveSecondLayer, secondLayerDone } from './second-layer';

test('second layer done, first layer intact, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    try {
      const start = applyAll(solved(), scramble(mulberry32(seed)));
      const s2 = solveFirstLayer(solveCross(solveDaisy(start).state).state).state;
      const { stage, state } = solveSecondLayer(s2);
      expect(secondLayerDone(state)).toBe(true);
      expect(firstLayerDone(state) && crossDone(state)).toBe(true);
      expect(applyAll(s2, stage.moves)).toEqual(state);
    } catch (err) {
      throw new Error(`seed=${seed}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
});
