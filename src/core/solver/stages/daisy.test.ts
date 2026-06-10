import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy, daisyDone } from './daisy';

test('daisy invariant holds after stage, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    try {
      const start = applyAll(solved(), scramble(mulberry32(seed)));
      const { stage, state } = solveDaisy(start);
      expect(daisyDone(state)).toBe(true);
      // returned moves reproduce the returned state
      expect(applyAll(start, stage.moves)).toEqual(state);
      expect(stage.name).toBe('Daisy');
    } catch (err) {
      throw new Error(`seed=${seed}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
});

test('already-done daisy emits zero moves', () => {
  // solved cube has white edges on D, not a daisy — build one: lift all four
  // (F2 B2 R2 L2 makes a daisy from solved)
  const start = applyAll(solved(), [
    { face: 'F', turns: 2 },
    { face: 'B', turns: 2 },
    { face: 'R', turns: 2 },
    { face: 'L', turns: 2 },
  ] as const);
  expect(daisyDone(start)).toBe(true);
  expect(solveDaisy(start).stage.moves).toHaveLength(0);
});
