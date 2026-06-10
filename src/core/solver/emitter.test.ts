import { expect, test } from 'vitest';
import { solved } from '../cube-model/state';
import { Emitter } from './emitter';

test('action() groups emitted moves under a why', () => {
  const e = new Emitter(solved(), 100, 'Daisy');
  e.action('first', () => e.do('R U'));
  e.action('second', () => e.do("R'"));
  const stage = e.toStage();
  expect(stage.groups.map((g) => g.why)).toEqual(['first', 'second']);
  expect(stage.groups[0].moves).toHaveLength(2);
  expect(stage.moves).toHaveLength(3);
});

test('cleanup runs per action and drops fully-cancelled actions', () => {
  const e = new Emitter(solved(), 100, 'Daisy');
  e.action('merges', () => e.do('R R')); // → R2
  e.action('cancels', () => e.do("U U'")); // → nothing
  const stage = e.toStage();
  expect(stage.groups).toHaveLength(1);
  expect(stage.groups[0].moves).toEqual([{ face: 'R', turns: 2 }]);
  expect(stage.moves).toEqual([{ face: 'R', turns: 2 }]);
});

test('moves do not merge across action boundaries', () => {
  const e = new Emitter(solved(), 100, 'Daisy');
  e.action('a', () => e.do('R'));
  e.action('b', () => e.do('R'));
  expect(e.toStage().moves).toHaveLength(2); // stays R R, not R2
});

test('do() outside an action throws', () => {
  const e = new Emitter(solved(), 100, 'Daisy');
  expect(() => e.do('R')).toThrow(/outside action/);
});

test('nested action() throws', () => {
  const e = new Emitter(solved(), 100, 'Daisy');
  expect(() => e.action('outer', () => e.action('inner', () => e.do('R')))).toThrow(/nested/);
});
