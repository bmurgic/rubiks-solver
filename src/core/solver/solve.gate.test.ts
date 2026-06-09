import { expect, test } from 'vitest';
import { isSolved, solved } from '../cube-model/state';
import { applyAll } from '../cube-model/apply';
import { mulberry32 } from '../scramble/rng';
import { scramble } from '../scramble/scramble';
import { solve } from './solve';
import { STAGE_NAMES } from './types';

test('10,000 random scrambles all solve to the solved state', () => {
  for (let seed = 0; seed < 10_000; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const stages = solve(start);
    expect(stages.map((s) => s.name)).toEqual(STAGE_NAMES);
    const end = applyAll(start, stages.flatMap((s) => [...s.moves]));
    expect(isSolved(end)).toBe(true);
  }
}, 120_000);
