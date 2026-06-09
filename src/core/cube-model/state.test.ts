import { expect, test } from 'vitest';
import { isSolved, solved } from './state';

test('solved() produces a state that isSolved recognises', () => {
  expect(isSolved(solved())).toBe(true);
});

test('isSolved returns false when corner permutation is disturbed', () => {
  const s = solved();
  const mutated = { ...s, cp: [1, 0, 2, 3, 4, 5, 6, 7] };
  expect(isSolved(mutated)).toBe(false);
});

test('isSolved returns false when edge orientation is disturbed', () => {
  const s = solved();
  const mutated = { ...s, eo: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  expect(isSolved(mutated)).toBe(false);
});

test('isSolved returns false when array length differs', () => {
  const s = solved();
  const mutated = { ...s, cp: [0, 1, 2, 3, 4, 5, 6] };
  expect(isSolved(mutated)).toBe(false);
});
