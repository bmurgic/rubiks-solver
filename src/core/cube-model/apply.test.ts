import { expect, test } from 'vitest';
import { isSolved, solved } from './state';
import { apply } from './apply';
import { inverse, move } from './moves';
import { parse } from '../notation/notation';

const FACES = ['U', 'D', 'L', 'R', 'F', 'B'] as const;

test.each(FACES)('%s applied 4 times is identity', (face) => {
  let s = solved();
  for (let i = 0; i < 4; i++) s = apply(s, move(face));
  expect(isSolved(s)).toBe(true);
});

test.each(FACES)('%s2 applied twice is identity', (face) => {
  let s = solved();
  s = apply(s, move(face, 2));
  s = apply(s, move(face, 2));
  expect(isSolved(s)).toBe(true);
});

test.each(FACES)("%s then %s' is identity", (face) => {
  const s = apply(apply(solved(), move(face)), inverse(move(face)));
  expect(isSolved(s)).toBe(true);
});

test("(R U R' U') six times is identity", () => {
  let s = solved();
  for (let i = 0; i < 6; i++) for (const m of parse("R U R' U'")) s = apply(s, m);
  expect(isSolved(s)).toBe(true);
});

test('a move sequence followed by its inverse is identity', () => {
  const seq = parse("R U2 F' D L2 B U' R2 F L D2 B'");
  let s = solved();
  for (const m of seq) s = apply(s, m);
  for (const m of [...seq].reverse().map(inverse)) s = apply(s, m);
  expect(isSolved(s)).toBe(true);
});

test('U permutes only the U layer and flips nothing', () => {
  const s = apply(solved(), move('U'));
  expect(s.cp).toEqual([3, 0, 1, 2, 4, 5, 6, 7]);
  expect(s.ep).toEqual([3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(s.co.every((v) => v === 0)).toBe(true);
  expect(s.eo.every((v) => v === 0)).toBe(true);
});
