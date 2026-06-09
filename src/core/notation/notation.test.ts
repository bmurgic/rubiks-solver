import { expect, test } from 'vitest';
import { format, parse } from './notation';

test('parses and formats round-trip', () => {
  const s = "R U R' U' F2 D' B2";
  expect(format(parse(s))).toBe(s);
});

test('rejects malformed notation', () => {
  expect(() => parse('R X')).toThrow();
  expect(() => parse("R''")).toThrow();
});
