import { expect, test } from 'vitest';
import { STAGE_NAMES } from '../core/solver/types';
import { METHOD_INTRO, STAGE_LESSONS } from './teaching';

test('every stage has a non-empty goal and why', () => {
  for (const name of STAGE_NAMES) {
    const lesson = STAGE_LESSONS[name];
    expect(lesson, `missing lesson for ${name}`).toBeDefined();
    expect(lesson.goal.trim().length).toBeGreaterThan(0);
    expect(lesson.why.trim().length).toBeGreaterThan(0);
  }
});

test('method intro is non-empty', () => {
  expect(METHOD_INTRO.trim().length).toBeGreaterThan(0);
});
