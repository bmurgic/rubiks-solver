import type { CubeState } from '../cube-model/state';
import type { Move } from '../cube-model/moves';
import { apply } from '../cube-model/apply';

/**
 * Build a length-(moves+1) array where snapshots[0] = start and
 * snapshots[i+1] = apply(snapshots[i], moves[i]). Lets playback render
 * any move's pre-state in O(1).
 */
export function buildSnapshots(start: CubeState, moves: readonly Move[]): CubeState[] {
  const out: CubeState[] = [start];
  for (const m of moves) {
    out.push(apply(out[out.length - 1], m));
  }
  return out;
}
