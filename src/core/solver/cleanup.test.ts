import { expect, test } from 'vitest';
import { parse, format } from '../notation/notation';
import { cleanup } from './cleanup';
import { applyAll } from '../cube-model/apply';
import { solved } from '../cube-model/state';
import { mulberry32 } from '../scramble/rng';
import { scramble } from '../scramble/scramble';

test("R R' cancels, U U merges to U2, U2 U2 cancels", () => {
  expect(format(cleanup(parse("R R'")))).toBe('');
  expect(format(cleanup(parse('U U')))).toBe('U2');
  expect(format(cleanup(parse('U2 U2 F')))).toBe('F');
});

test('cleaned sequence reaches the same state as the raw sequence', () => {
  for (let seed = 0; seed < 30; seed++) {
    const raw = [...scramble(mulberry32(seed)), ...parse("R R' U U F2 F2 D D D D")];
    expect(applyAll(solved(), cleanup(raw))).toEqual(applyAll(solved(), raw));
  }
});
