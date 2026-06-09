import type { Move, Turns } from '../cube-model/moves';

const TURNS_MOD = 4;

/**
 * Merge/cancel adjacent same-face moves. Within-stage only — callers pass one
 * stage's moves so a same-face combo in stage N+1 never collapses into stage N.
 */
export function cleanup(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    let merged: Move | undefined = m;
    while (merged !== undefined && out.length > 0 && out[out.length - 1].face === merged.face) {
      const prev = out.pop() as Move;
      const combined: number = (prev.turns + merged.turns) % TURNS_MOD;
      merged = combined === 0 ? undefined : { face: merged.face, turns: combined as Turns };
    }
    if (merged !== undefined) out.push(merged);
  }
  return out;
}
