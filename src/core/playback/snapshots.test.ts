import { expect, test } from 'vitest';
import { solved } from '../cube-model/state';
import { apply } from '../cube-model/apply';
import { parse } from '../notation/notation';
import { buildSnapshots } from './snapshots';

test('snapshots: states[i+1] = apply(states[i], moves[i]), length = moves+1', () => {
  const moves = parse("R U R' U' F2 D");
  const snaps = buildSnapshots(solved(), moves);
  expect(snaps).toHaveLength(moves.length + 1);
  moves.forEach((m, i) => expect(snaps[i + 1]).toEqual(apply(snaps[i], m)));
});
