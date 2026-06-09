import { expect, test } from 'vitest';
import { solved } from '../cube-model/state';
import { applyAll } from '../cube-model/apply';
import { mulberry32 } from '../scramble/rng';
import { scramble } from '../scramble/scramble';
import { assertSolvable, UnsolvableCubeError } from './validate';

test('solved and scrambled states pass', () => {
  expect(() => assertSolvable(solved())).not.toThrow();
  expect(() => assertSolvable(applyAll(solved(), scramble(mulberry32(7))))).not.toThrow();
});

test('single twisted corner violates twist invariant', () => {
  const s = solved();
  const bad = { ...s, co: [1, ...s.co.slice(1)] };
  expect(() => assertSolvable(bad)).toThrow(UnsolvableCubeError);
  expect(() => assertSolvable(bad)).toThrow(/twist/);
});

test('single flipped edge violates flip invariant', () => {
  const s = solved();
  const bad = { ...s, eo: [1, ...s.eo.slice(1)] };
  expect(() => assertSolvable(bad)).toThrow(/flip/);
});

test('two swapped edges alone violate parity invariant', () => {
  const s = solved();
  const ep = [...s.ep];
  [ep[0], ep[1]] = [ep[1], ep[0]];
  expect(() => assertSolvable({ ...s, ep })).toThrow(/parity/);
});

test('duplicate cubie violates structure invariant', () => {
  const s = solved();
  expect(() => assertSolvable({ ...s, cp: [0, 0, 2, 3, 4, 5, 6, 7] })).toThrow(/structure/);
});
