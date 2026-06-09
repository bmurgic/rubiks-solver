import { expect, test } from 'vitest';
import { mulberry32 } from './rng';
import { scramble } from './scramble';

const AXIS: Record<string, string> = { U: 'y', D: 'y', L: 'x', R: 'x', F: 'z', B: 'z' };

test('produces requested length, default 25', () => {
  expect(scramble(mulberry32(1))).toHaveLength(25);
});

test('never repeats a face consecutively, never three same-axis in a row', () => {
  for (let seed = 0; seed < 50; seed++) {
    const ms = scramble(mulberry32(seed));
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i].face).not.toBe(ms[i - 1].face);
      if (i >= 2) {
        const sameAxis =
          AXIS[ms[i].face] === AXIS[ms[i - 1].face] && AXIS[ms[i].face] === AXIS[ms[i - 2].face];
        expect(sameAxis).toBe(false);
      }
    }
  }
});

test('same seed gives same scramble', () => {
  expect(scramble(mulberry32(42))).toEqual(scramble(mulberry32(42)));
});
