import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';

test('cross invariant holds after daisy+cross, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    try {
      const start = applyAll(solved(), scramble(mulberry32(seed)));
      const afterDaisy = solveDaisy(start).state;
      const { stage, state } = solveCross(afterDaisy);
      expect(crossDone(state)).toBe(true);
      expect(applyAll(afterDaisy, stage.moves)).toEqual(state);
    } catch (err) {
      throw new Error(`seed=${seed}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
});
