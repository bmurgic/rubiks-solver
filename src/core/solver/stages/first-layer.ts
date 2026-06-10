import type { CubeState } from '../../cube-model/state';
import { Corner } from '../../cube-model/state';
import { Emitter, rotateUUntil } from '../emitter';
import { cornerRef, cornerSlot } from '../recognition';
import { StageCapError, type Stage } from '../types';

export const FIRST_LAYER_MOVE_CAP = 120;
export const INSERT_TRIAL_GUARD = 14;
const D_LAYER_MIN_SLOT = 4;

export const WHITE_CORNERS = [Corner.DFR, Corner.DLF, Corner.DBL, Corner.DRB] as const;

/** Per home D slot: tutorial "righty" conjugate and the U slot directly above it. */
const INSERT: Record<number, { alg: string; above: number }> = {
  [Corner.DFR]: { alg: "R U R' U'", above: Corner.URF },
  [Corner.DLF]: { alg: "F U F' U'", above: Corner.UFL },
  [Corner.DBL]: { alg: "L U L' U'", above: Corner.ULB },
  [Corner.DRB]: { alg: "B U B' U'", above: Corner.UBR },
};

function cornerSolved(s: CubeState, cubie: number): boolean {
  return s.cp[cubie] === cubie && s.co[cubie] === 0;
}

export function firstLayerDone(s: CubeState): boolean {
  return WHITE_CORNERS.every((c) => cornerSolved(s, c));
}

function insertCorner(e: Emitter, cubie: number): void {
  // Eject if stuck in any D slot (wrong slot, or home slot but twisted).
  const slot = cornerSlot(e.state, cubie);
  if (slot >= D_LAYER_MIN_SLOT && !cornerSolved(e.state, cubie)) {
    e.action('This white corner is stuck in the bottom — run the trigger to pop it out.', [cornerRef(cubie)], () =>
      e.do(INSERT[slot].alg),
    );
  }
  const { alg, above } = INSERT[cubie];
  for (let i = 0; i < INSERT_TRIAL_GUARD && !cornerSolved(e.state, cubie); i++) {
    const cur = cornerSlot(e.state, cubie);
    if (cur === cubie) {
      // Home slot but twisted: run the alg again to re-eject and reinsert.
      e.action('The corner is in its slot but twisted — run the trigger again to re-seat it.', [cornerRef(cubie)], () =>
        e.do(alg),
      );
      continue;
    }
    e.action(
      'Spin the top until the corner sits over its home slot, then run the righty trigger.',
      [cornerRef(cubie)],
      () => {
        rotateUUntil(e, (s) => cornerSlot(s, cubie) === above);
        e.do(alg);
      },
    );
  }
  if (!cornerSolved(e.state, cubie)) {
    throw new StageCapError('First Layer', `corner ${cubie} did not insert`);
  }
}

export function solveFirstLayer(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, FIRST_LAYER_MOVE_CAP, 'First Layer');
  for (const cubie of WHITE_CORNERS) {
    if (cornerSolved(e.state, cubie)) continue;
    insertCorner(e, cubie);
  }
  return { stage: e.toStage(), state: e.state };
}
