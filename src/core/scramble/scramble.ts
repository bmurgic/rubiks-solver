import type { Face, Move, Turns } from '../cube-model/moves';
import type { Rng } from './rng';

type Axis = 'x' | 'y' | 'z';

const FACES: readonly Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
const AXIS: Record<Face, Axis> = {
  U: 'y',
  D: 'y',
  L: 'x',
  R: 'x',
  F: 'z',
  B: 'z',
};
const TURNS: readonly Turns[] = [1, 2, 3];
const DEFAULT_SCRAMBLE_LENGTH = 25;

/**
 * Generate a WCA-style scramble: random moves with no consecutive same-face
 * repeats and no three-in-a-row same-axis runs.
 *
 * @param rng PRNG source — pass `mulberry32(seed)` for determinism.
 * @param length Number of moves to emit. Defaults to a standard 25.
 * @returns The scramble move sequence.
 */
export function scramble(rng: Rng, length = DEFAULT_SCRAMBLE_LENGTH): Move[] {
  const out: Move[] = [];
  while (out.length < length) {
    const face = FACES[Math.floor(rng() * FACES.length)];
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    if (prev && prev.face === face) continue;
    if (prev && prev2 && AXIS[face] === AXIS[prev.face] && AXIS[face] === AXIS[prev2.face]) {
      continue;
    }
    out.push({ face, turns: TURNS[Math.floor(rng() * TURNS.length)] });
  }
  return out;
}
