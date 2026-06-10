import { expect, test } from 'vitest';
import { stageIndexAt } from './stage-index';

// Two stages: stage 0 owns moves [0,3), stage 1 owns [3,..).
const STARTS = [0, 3];

test('returns 0 before the second stage begins', () => {
  expect(stageIndexAt(STARTS, 0)).toBe(0);
  expect(stageIndexAt(STARTS, 2)).toBe(0);
});

test('returns the later stage at and past its boundary', () => {
  expect(stageIndexAt(STARTS, 3)).toBe(1);
  expect(stageIndexAt(STARTS, 9)).toBe(1);
});

test('handles a single stage starting at 0', () => {
  expect(stageIndexAt([0], 0)).toBe(0);
  expect(stageIndexAt([0], 50)).toBe(0);
});
