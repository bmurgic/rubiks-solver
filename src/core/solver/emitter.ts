import type { CubeState } from '../cube-model/state';
import type { Move } from '../cube-model/moves';
import { apply } from '../cube-model/apply';
import { parse } from '../notation/notation';
import { cleanup } from './cleanup';
import { StageCapError, type ActionGroup, type PieceRef, type Stage, type StageName } from './types';

const ROTATE_U_MAX_TURNS = 4;

export class Emitter {
  state: CubeState;
  readonly moves: Move[] = []; // raw, pre-cleanup (cap counts these)
  /** Inclusive — throws StageCapError on the (cap+1)th emitted move. */
  private readonly cap: number;
  readonly stage: StageName;
  private readonly groups: ActionGroup[] = [];
  private currentStart: number | null = null;

  constructor(state: CubeState, cap: number, stage: StageName) {
    this.state = state;
    this.cap = cap;
    this.stage = stage;
  }

  /**
   * Bracket one narrated action: every do() inside `fn` belongs to `why`,
   * and `targets` names the cubie(s) the narration references (may be empty).
   * The slice is cleaned on close; fully-cancelled actions are dropped.
   */
  action(why: string, targets: readonly PieceRef[], fn: () => void): void {
    if (this.currentStart !== null) {
      throw new Error(`Emitter(${this.stage}): nested action() is not allowed`);
    }
    this.currentStart = this.moves.length;
    try {
      fn();
      const moves = cleanup(this.moves.slice(this.currentStart));
      if (moves.length > 0) this.groups.push({ why, targets, moves });
    } finally {
      this.currentStart = null;
    }
  }

  do(seq: string | readonly Move[]): void {
    if (this.currentStart === null) {
      throw new Error(`Emitter(${this.stage}): do() outside action()`);
    }
    const ms = typeof seq === 'string' ? parse(seq) : seq;
    for (const m of ms) {
      this.state = apply(this.state, m);
      this.moves.push(m);
      if (this.moves.length > this.cap) {
        throw new StageCapError(this.stage, `exceeded ${this.cap}-move cap`);
      }
    }
  }

  /** The finished stage: per-action cleaned groups + their concatenation. */
  toStage(): Stage {
    const groups = [...this.groups];
    return { name: this.stage, groups, moves: groups.flatMap((g) => g.moves) };
  }
}

/**
 * Rotate the U face up to 3 times searching for a state matching `pred`.
 * Must be called inside an enclosing action(). Throws StageCapError tagged
 * with the emitter's own stage if no U setup satisfies the predicate.
 */
export function rotateUUntil(e: Emitter, pred: (s: CubeState) => boolean): void {
  for (let i = 0; i < ROTATE_U_MAX_TURNS; i++) {
    if (pred(e.state)) return;
    e.do('U');
  }
  throw new StageCapError(e.stage, 'U-setup predicate never satisfied');
}
