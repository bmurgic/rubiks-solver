import { expect, test } from 'vitest';
import { solved } from '../cube-model/state';
import { toFacelets } from './facelets';

test('solved cube derives 9 stickers of each face color in face order U,R,F,D,L,B', () => {
  const f = toFacelets(solved());
  expect(f).toHaveLength(54);
  const faces = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
  faces.forEach((face, i) => {
    expect(f.slice(i * 9, i * 9 + 9)).toEqual(Array(9).fill(face));
  });
});
