import { expect, test } from 'vitest';
import { faceletIndexAt } from './facelet-grid';

test('maps URF corner stickers to Kociemba facelet indices', () => {
  expect(faceletIndexAt([1, 1, 1], [0, 1, 0])).toBe(8); // U sticker of URF
  expect(faceletIndexAt([1, 1, 1], [1, 0, 0])).toBe(9); // R sticker
  expect(faceletIndexAt([1, 1, 1], [0, 0, 1])).toBe(20); // F sticker
});

test('face centers map to index 4 within each face', () => {
  expect(faceletIndexAt([0, 1, 0], [0, 1, 0])).toBe(4); // U center
  expect(faceletIndexAt([0, 0, 1], [0, 0, 1])).toBe(2 * 9 + 4); // F center
  expect(faceletIndexAt([0, -1, 0], [0, -1, 0])).toBe(3 * 9 + 4); // D center
});

test('returns null when the cubelet does not own the requested face surface', () => {
  expect(faceletIndexAt([0, 0, 1], [0, 1, 0])).toBeNull(); // F-center is not on U surface
});
