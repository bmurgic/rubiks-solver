import type { CubeState } from '../cube-model/state';
import type { Move } from '../cube-model/moves';
import { apply } from '../cube-model/apply';
import { parse } from '../notation/notation';
import { StageCapError, type StageName } from './types';

const ROTATE_U_MAX_TURNS = 4;

export class Emitter {
  state: CubeState;
  readonly moves: Move[] = [];
  /** Inclusive — throws StageCapError on the (cap+1)th emitted move. */
  private readonly cap: number;
  readonly stage: StageName;

  constructor(state: CubeState, cap: number, stage: StageName) {
    this.state = state;
    this.cap = cap;
    this.stage = stage;
  }

  do(seq: string | readonly Move[]): void {
    const ms = typeof seq === 'string' ? parse(seq) : seq;
    for (const m of ms) {
      this.state = apply(this.state, m);
      this.moves.push(m);
      if (this.moves.length > this.cap) {
        throw new StageCapError(this.stage, `exceeded ${this.cap}-move cap`);
      }
    }
  }
}

/**
 * Rotate the U face up to 3 times searching for a state matching `pred`.
 * Throws StageCapError tagged with the emitter's own stage if no U setup
 * satisfies the predicate.
 */
export function rotateUUntil(e: Emitter, pred: (s: CubeState) => boolean): void {
  for (let i = 0; i < ROTATE_U_MAX_TURNS; i++) {
    if (pred(e.state)) return;
    e.do('U');
  }
  throw new StageCapError(e.stage, 'U-setup predicate never satisfied');
}
