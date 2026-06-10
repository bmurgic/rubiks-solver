# Cubelet Highlight & Layer Cue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight the cubelet(s) each narrated action references with a pulsing glow, and tint the layer that is about to rotate (or is rotating), during solve playback.

**Architecture:** The solver alone knows which cubie an action is about, so each `e.action(...)` call gains a `targets: readonly PieceRef[]` argument that flows through `ActionGroup` as pure data. The view resolves each target cubie to its current slot via the live `CubeState` (`ep`/`cp`), maps the slot to a 3D grid position with static tables, and renders a translucent glow shell on that cubelet. The layer cue is derived in `App` from the upcoming/animating move's face and rendered as a faint constant shell on the 9 cubelets of that face. `src/core/**` stays free of three/react imports.

**Tech Stack:** Vite + React 19 + TS, @react-three/fiber + drei, Vitest (explicit imports, no globals), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-10-cubelet-highlight-design.md`

**Branch:** `feat/teach-the-solve` (already checked out; previous narration work is committed).

**Hard constraints:**
- All existing e2e `data-testid`s preserved verbatim.
- `src/core/**` must not import three/react (eslint boundary enforces this).
- No emoji anywhere.
- `Solution`/`AppState` reducer semantics unchanged except the additions named here.

**Verification commands** (used throughout):
- Unit: `npm test` (Vitest; currently 61 tests pass)
- One file: `npx vitest run src/core/solver/emitter.test.ts`
- Lint: `npm run lint` | Build: `npm run build`
- e2e: `npm run e2e` (currently 6 pass; dev server NOT required — Playwright starts its own)

---

## Domain primer (read first)

- `CubeState` is cubie-level: `ep[slot] = edge cubie occupying slot` (12 slots/cubies), `cp[slot] = corner cubie` (8). Cubie ids are `Edge.UR === 0 … Edge.BR === 11`, `Corner.URF === 0 … Corner.DRB === 7` (`src/core/cube-model/state.ts`).
- The 3D cube renders 26 cubelets at fixed grid positions `[-1|0|1]³` (`POSITIONS` in `src/view/CubeView.tsx`). Recoloring happens via the facelets array; meshes never move except inside `TurningGroup` during a turn.
- Axis convention: `U=+y, D=−y, R=+x, L=−x, F=+z, B=−z` (`FACE_SELECTOR`/`FACE_AXIS` in CubeView).
- An "action" is one narrated solver step: `e.action(why, fn)` brackets the moves `fn` emits into an `ActionGroup { why, moves }`. Playback dwells at each group boundary and shows `why` as the "Now:" caption.
- `App.tsx` holds `cube: CubeState` snapshot-correct for the current `moveIndex` (snapshots array), plus `groupStart`/`groupWhy` parallel arrays built in `buildSolution`. `stageIndexAt(starts, i)` returns the index of the last start ≤ i.

---

## Task 1: Solver emits piece targets per action

**Depends on:** none

**Files:**
- Modify: `src/core/solver/types.ts`
- Modify: `src/core/solver/recognition.ts` (add two tiny ref helpers)
- Modify: `src/core/solver/emitter.ts`
- Modify: `src/core/solver/stages/daisy.ts`, `cross.ts`, `first-layer.ts`, `second-layer.ts`, `oll.ts`, `pll.ts`
- Test: `src/core/solver/emitter.test.ts` (extend), `src/core/solver/solve.gate.test.ts` (extend invariants)

### Target choices per action (the source of truth for step 5)

Targets are **piece identities** (cubie ids), captured from `e.state` at the moment `action()` is called (= state before the action's first move). Rule: the pieces the why-sentence references; setup-only narration gets the pieces it talks about or `[]`.

| Stage | Action | Targets |
|---|---|---|
| Daisy | flipped petal push-out | the edge in that U slot: `edgeRef(e.state.ep[slot])` |
| Daisy | white-down double-turn flip | the edge in that D slot: `edgeRef(e.state.ep[slot])` |
| Daisy | white-sideways single turn | the edge in that D slot: `edgeRef(e.state.ep[slot])` |
| Daisy | E-layer lift | the edge in that E slot: `edgeRef(e.state.ep[slot])` |
| Cross | align + drop | `edgeRef(cubie)` (in scope) |
| First Layer | eject stuck corner | `cornerRef(cubie)` |
| First Layer | re-seat twisted corner | `cornerRef(cubie)` |
| First Layer | align + righty trigger | `cornerRef(cubie)` |
| Second Layer | eject wrong-slot edge | `edgeRef(cubie)` (cubie newly passed in; see step 5) |
| Second Layer | match + insert | `edgeRef(cubie)` |
| OLL | all edge actions | unoriented U-layer edges at action time: `unorientedEdges(e.state)` |
| OLL | all corner actions | unoriented U-layer corners: `unorientedCorners(e.state)` |
| PLL | both corner-perm actions | all four U-corner cubies: `uCornerRefs(e.state)` |
| PLL | corner alignment spin | all four U-corner cubies: `uCornerRefs(e.state)` |
| PLL | H/Z edge action | unsolved U edges: `unsolvedEdges(e.state)` |
| PLL | park + U-perm action | unsolved U edges: `unsolvedEdges(e.state)` |

- [ ] **Step 1: Extend the failing emitter test**

Append to `src/core/solver/emitter.test.ts` (it already imports `expect`/`test` from `vitest`, `Emitter` from `./emitter`, and `solved` from `../cube-model/state` — reuse those imports and the flat `test(...)` style):

```ts
test('action() stores the targets on the finished group', () => {
  const e = new Emitter(solved(), 99, 'Daisy');
  e.action('move this edge', [{ kind: 'edge', piece: 5 }], () => e.do('R'));
  expect(e.toStage().groups[0].targets).toEqual([{ kind: 'edge', piece: 5 }]);
});

test('action() allows empty targets for generic actions', () => {
  const e = new Emitter(solved(), 99, 'Daisy');
  e.action('look around', [], () => e.do('U'));
  expect(e.toStage().groups[0].targets).toEqual([]);
});
```

Note: existing tests in this file call `e.action(why, fn)` with two arguments — update every existing call in the file to pass `[]` as the new middle argument: `e.action(why, [], fn)`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/core/solver/emitter.test.ts`
Expected: FAIL — TypeScript/runtime errors because `action` takes 2 args and `targets` doesn't exist on `ActionGroup`.

- [ ] **Step 3: Add `PieceRef` to types and thread through the emitter**

`src/core/solver/types.ts` — add above `ActionGroup` and extend it:

```ts
export interface PieceRef {
  readonly kind: 'edge' | 'corner';
  readonly piece: number; // cubie id: Edge.* (0-11) or Corner.* (0-7)
}

export interface ActionGroup {
  /** Beginner-facing reason for this action (1 line). */
  readonly why: string;
  /** Pieces the narration references; may be empty for setup-only actions. */
  readonly targets: readonly PieceRef[];
  readonly moves: readonly Move[]; // cleaned; never empty
}
```

`src/core/solver/emitter.ts` — import `PieceRef` from `./types` and change `action`:

```ts
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
```

`src/core/solver/recognition.ts` — append two helpers (import `PieceRef` from `./types`):

```ts
/** PieceRef for an edge cubie id. */
export const edgeRef = (piece: number): PieceRef => ({ kind: 'edge', piece });

/** PieceRef for a corner cubie id. */
export const cornerRef = (piece: number): PieceRef => ({ kind: 'corner', piece });
```

- [ ] **Step 4: Run emitter tests — expect stage files to still break the build**

Run: `npx vitest run src/core/solver/emitter.test.ts`
Expected: the two new tests PASS (vitest only type-checks the files it loads transitively — if stage files error here, that's fine; they're fixed next).

- [ ] **Step 5: Update all six stages**

`src/core/solver/stages/daisy.ts` — add `edgeRef` to the existing recognition import (`import { edgeSlot, whiteEdgeFace, edgeRef } from '../recognition';`), then update the three action call sites:

```ts
function placeFromULayer(e: Emitter, slot: number): 'done' | 'continue' {
  const white = whiteEdgeFace(e.state, slot);
  if (white === 'U') return 'done';
  // White faces a side — drop into E layer through that side face.
  e.action('This petal is flipped — push it out into the middle layer.', [edgeRef(e.state.ep[slot])], () =>
    e.do(white),
  );
  return 'continue';
}
```

```ts
function placeFromDLayer(e: Emitter, slot: number): 'done' | 'continue' {
  const side = D_SLOT_SIDE[slot];
  const white = whiteEdgeFace(e.state, slot);
  if (white === 'D') {
    // Two-turn flip: rotate U so destination petal is free, then side2.
    const destSlot = U_SLOT_OF_FACE[side];
    if (destSlot === undefined) throw new StageCapError('Daisy', `no U slot for side ${side}`);
    e.action(
      'A white edge points down — spin the top to free its petal spot, then flip it up with a double turn.',
      [edgeRef(e.state.ep[slot])],
      () => {
        rotateUUntil(e, (s) => !isPetalAt(s, destSlot));
        e.do(`${side}2`);
      },
    );
    return 'done';
  }
  // White on side — single side turn moves it to the E layer.
  e.action(
    'A bottom edge shows white sideways — turn that side to send it into the middle layer.',
    [edgeRef(e.state.ep[slot])],
    () => e.do(side),
  );
  return 'continue';
}
```

```ts
function placeFromELayer(e: Emitter, slot: number): 'done' {
  const white = whiteEdgeFace(e.state, slot);
  const liftTable = E_LIFT[slot];
  const lift = liftTable?.[white as Face];
  if (lift === undefined) throw new StageCapError('Daisy', `no E-lift for slot ${slot}/${white}`);
  const destFace = lift[0] as Face;
  const destSlot = U_SLOT_OF_FACE[destFace];
  if (destSlot === undefined) throw new StageCapError('Daisy', `no U slot for face ${destFace}`);
  e.action('Make room on top, then lift the white edge up into the daisy.', [edgeRef(e.state.ep[slot])], () => {
    rotateUUntil(e, (s) => !isPetalAt(s, destSlot));
    e.do(lift);
  });
  return 'done';
}
```

`src/core/solver/stages/cross.ts` — add `edgeRef` to the recognition import, update the single action:

```ts
    e.action(
      'Spin the top so this petal lines up with its matching side center, then drop it down with a double turn.',
      [edgeRef(cubie)],
      () => {
        rotateUUntil(e, (s) => edgeSlot(s, cubie) === destSlot);
        e.do(`${side}2`);
      },
    );
```

`src/core/solver/stages/first-layer.ts` — change the recognition import to `import { cornerSlot, cornerRef } from '../recognition';`, update the three actions in `insertCorner`:

```ts
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
```

`src/core/solver/stages/second-layer.ts` — add `edgeRef` to the recognition import. `ejectFromELayer` only receives `slot`; change its signature to also take the cubie (the caller has it):

```ts
function ejectFromELayer(e: Emitter, cubie: number, slot: number): void {
  // Stuck in the E layer (wrong slot or flipped): eject by running that slot's
  // first case alg after parking a non-middle edge at its park slot so we
  // don't disturb other already-solved middle edges.
  const c0 = CASES[slot][0];
  const park = U_SLOT_OF_FACE[c0.alignFace];
  if (park === undefined) {
    throw new StageCapError('Second Layer', `no U slot for face ${c0.alignFace}`);
  }
  e.action('This middle edge is in the wrong slot — run the insert to eject it up top.', [edgeRef(cubie)], () => {
    rotateUUntil(e, (s) => !(MIDDLE_EDGES as readonly number[]).includes(s.ep[park]));
    e.do(c0.alg);
  });
}
```

Update its call site in `solveSecondLayer`: `ejectFromELayer(e, cubie, slot);`

And `insertFromULayer`'s action:

```ts
  e.action(
    'Match the edge with its side center, then send it down into its slot with the insert trigger.',
    [edgeRef(cubie)],
    () => {
      rotateUUntil(e, (s) => edgeSlot(s, cubie) === dest);
      e.do(targetCase.alg);
    },
  );
```

`src/core/solver/stages/oll.ts` — add to the imports: `import { cornerSticker, edgeSticker, edgeRef, cornerRef } from '../recognition';` and `import { StageCapError, type PieceRef, type Stage } from '../types';`. Add two helpers after `orientedCornerCount`:

```ts
const unorientedEdges = (s: CubeState): PieceRef[] =>
  U_EDGE_SLOTS.filter((sl) => !edgeUp(s, sl)).map((sl) => edgeRef(s.ep[sl]));

const unorientedCorners = (s: CubeState): PieceRef[] =>
  U_CORNER_SLOTS.filter((sl) => !cornerUp(s, sl)).map((sl) => cornerRef(s.cp[sl]));
```

Update the three edge actions in `orientEdges` (targets evaluated at call time):

```ts
      e.action(
        'No yellow edges are up yet — run the edge algorithm once to get an L shape.',
        unorientedEdges(e.state),
        () => e.do(F_SEXY_F),
      );
```

```ts
        e.action(
          'Two yellow edges form a line — lay it flat, then run the edge algorithm to finish the yellow cross.',
          unorientedEdges(e.state),
          () => {
            // Line: rotate until the line lies horizontal (UR + UL oriented).
            rotateUUntil(e, (s) => edgeUp(s, Edge.UR) && edgeUp(s, Edge.UL));
            e.do(F_SEXY_F);
          },
        );
```

```ts
        e.action(
          'Two yellow edges form an L — point it to the back-left, then run the mirrored edge algorithm.',
          unorientedEdges(e.state),
          () => {
            // L shape: rotate until the L sits at UB + UL (back/left oriented).
            rotateUUntil(e, (s) => edgeUp(s, Edge.UB) && edgeUp(s, Edge.UL));
            e.do(F_SEXY_PRIME_F);
          },
        );
```

And the single corner action in `orientCorners`:

```ts
    e.action(why, unorientedCorners(e.state), () => {
      rotateUUntil(e, pred);
      e.do(SUNE);
    });
```

`src/core/solver/stages/pll.ts` — add to imports: `import { cornerSticker, edgeRef, cornerRef } from '../recognition';` and `import { StageCapError, type PieceRef, type Stage } from '../types';`. Add helpers after `U_EDGE_SLOTS`:

```ts
const uCornerRefs = (s: CubeState): PieceRef[] => U_CORNER_SLOTS.map((sl) => cornerRef(s.cp[sl]));

const unsolvedEdges = (s: CubeState): PieceRef[] =>
  U_EDGE_SLOTS.filter((sl) => s.ep[sl] !== sl).map((sl) => edgeRef(s.ep[sl]));
```

Update the five actions:

```ts
      e.action(
        'Aim the matching corner pair (headlights) to the left, then swap the other two corners with the T-perm.',
        uCornerRefs(e.state),
        () => {
          rotateUUntil(e, (s) => headlightsOn(s, 'L'));
          e.do(T_PERM);
        },
      );
```

```ts
      e.action('No matching corner pair yet — run the T-perm once to create one.', uCornerRefs(e.state), () =>
        e.do(T_PERM),
      );
```

```ts
  e.action('Spin the top to line the corners up with their sides.', uCornerRefs(e.state), () =>
    rotateUUntil(e, cornersHome),
  );
```

```ts
      e.action('No top edges are in place — run a U-perm to leave just three to cycle.', unsolvedEdges(e.state), () =>
        e.do(U_PERM_A),
      );
```

```ts
    e.action(
      'Park the solved edge at the back, then cycle the last three edges with a U-perm.',
      unsolvedEdges(e.state),
      () => {
        const turns = uTurnsToUB(home[0]);
        if (turns > 0) e.do(Array<string>(turns).fill('U').join(' '));
        const tryA = applyAll(e.state, parse(U_PERM_A));
        const aFixes = homeEdgesUnderSomeAuf(tryA);
        e.do(aFixes === U_CYCLE_LENGTH ? U_PERM_A : U_PERM_B);
        rotateUUntil(e, cornersHome); // AUF / realign after the cycle.
      },
    );
```

- [ ] **Step 6: Run full unit suite**

Run: `npm test`
Expected: all tests pass (61 existing + 2 new emitter tests = 63).

- [ ] **Step 7: Extend the gate-test invariants**

In `src/core/solver/solve.gate.test.ts`, find the per-group invariant block (it asserts `why.trim().length > 0`, `moves.length > 0`, and flatten === stage.moves) and add target validity inside the same loop:

```ts
        for (const t of g.targets) {
          expect(['edge', 'corner']).toContain(t.kind);
          const max = t.kind === 'edge' ? 11 : 7;
          expect(t.piece).toBeGreaterThanOrEqual(0);
          expect(t.piece).toBeLessThanOrEqual(max);
          expect(Number.isInteger(t.piece)).toBe(true);
        }
```

- [ ] **Step 8: Run the gate test**

Run: `npx vitest run src/core/solver/solve.gate.test.ts`
Expected: PASS (10k scrambles; takes ~10-30s).

- [ ] **Step 9: Lint + build + commit**

Run: `npm run lint && npm run build`
Expected: both clean.

```bash
git add src/core/solver/ && git commit -m "feat: solver actions carry target piece refs"
```

---

## Task 2: Target pieces glow in the 3D view

**Depends on:** Task 1 (`ActionGroup.targets` must exist)

**Files:**
- Create: `src/view/piece-positions.ts`
- Create: `src/view/piece-positions.test.ts`
- Modify: `src/App.tsx` (Solution.groupTargets, highlightKeys derivation, CubeView props)
- Modify: `src/view/CubeView.tsx` (GlowShell, Cubelet highlight prop, CubeViewProps)

- [ ] **Step 1: Write failing tests for the slot-position tables and resolver**

Create `src/view/piece-positions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { solved, Corner, Edge } from '../core/cube-model/state';
import { apply } from '../core/cube-model/apply';
import { parse } from '../core/notation/notation';
import { CORNER_SLOT_POS, EDGE_SLOT_POS, targetPositions } from './piece-positions';

describe('slot position tables', () => {
  it('covers all 12 edge slots with distinct surface positions', () => {
    expect(EDGE_SLOT_POS).toHaveLength(12);
    expect(new Set(EDGE_SLOT_POS.map((p) => p.join(',')))).toHaveProperty('size', 12);
    // An edge position has exactly one zero coordinate.
    for (const p of EDGE_SLOT_POS) {
      expect(p.filter((c) => c === 0)).toHaveLength(1);
      expect(p.every((c) => c === -1 || c === 0 || c === 1)).toBe(true);
    }
  });

  it('covers all 8 corner slots with distinct corner positions', () => {
    expect(CORNER_SLOT_POS).toHaveLength(8);
    expect(new Set(CORNER_SLOT_POS.map((p) => p.join(',')))).toHaveProperty('size', 8);
    // A corner position has no zero coordinate.
    for (const p of CORNER_SLOT_POS) {
      expect(p.every((c) => c === -1 || c === 1)).toBe(true);
    }
  });

  it('maps named slots to the axis convention (U=+y, R=+x, F=+z)', () => {
    expect(EDGE_SLOT_POS[Edge.UF]).toEqual([0, 1, 1]);
    expect(EDGE_SLOT_POS[Edge.FR]).toEqual([1, 0, 1]);
    expect(EDGE_SLOT_POS[Edge.DB]).toEqual([0, -1, -1]);
    expect(CORNER_SLOT_POS[Corner.URF]).toEqual([1, 1, 1]);
    expect(CORNER_SLOT_POS[Corner.DBL]).toEqual([-1, -1, -1]);
  });
});

describe('targetPositions', () => {
  it('resolves pieces at home on the solved cube', () => {
    const got = targetPositions(solved(), [
      { kind: 'edge', piece: Edge.UF },
      { kind: 'corner', piece: Corner.URF },
    ]);
    expect(got).toEqual([
      [0, 1, 1],
      [1, 1, 1],
    ]);
  });

  it('follows a piece displaced by a move', () => {
    // R turn keeps R-face pieces on the R face but moves them off their home slots.
    const s = apply(solved(), parse('R')[0]);
    const [pos] = targetPositions(s, [{ kind: 'edge', piece: Edge.UR }]);
    expect(pos[0]).toBe(1); // still on the R face (x === 1)
    expect(pos.join(',')).not.toBe(EDGE_SLOT_POS[Edge.UR].join(',')); // no longer at home
  });

  it('returns an empty array for empty targets', () => {
    expect(targetPositions(solved(), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/view/piece-positions.test.ts`
Expected: FAIL — module `./piece-positions` does not exist.

- [ ] **Step 3: Implement `src/view/piece-positions.ts`**

```ts
import type { CubeState } from '../core/cube-model/state';
import type { PieceRef } from '../core/solver/types';
import type { Vec3 } from './facelet-grid';

// Axis convention (matches CubeView): U=+y, D=-y, R=+x, L=-x, F=+z, B=-z.

/** Index = edge slot id (Edge.*): UR UF UL UB DR DF DL DB FR FL BL BR. */
export const EDGE_SLOT_POS: readonly Vec3[] = [
  [1, 1, 0],
  [0, 1, 1],
  [-1, 1, 0],
  [0, 1, -1],
  [1, -1, 0],
  [0, -1, 1],
  [-1, -1, 0],
  [0, -1, -1],
  [1, 0, 1],
  [-1, 0, 1],
  [-1, 0, -1],
  [1, 0, -1],
];

/** Index = corner slot id (Corner.*): URF UFL ULB UBR DFR DLF DBL DRB. */
export const CORNER_SLOT_POS: readonly Vec3[] = [
  [1, 1, 1],
  [-1, 1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, -1, -1],
  [1, -1, -1],
];

/**
 * Grid positions of the cubelets currently holding the target pieces.
 * Finds each cubie's slot in the live state, then maps slot to position.
 */
export function targetPositions(state: CubeState, targets: readonly PieceRef[]): Vec3[] {
  return targets.map((t) =>
    t.kind === 'edge'
      ? EDGE_SLOT_POS[state.ep.indexOf(t.piece)]
      : CORNER_SLOT_POS[state.cp.indexOf(t.piece)],
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/view/piece-positions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Thread `groupTargets` through `buildSolution` and derive `highlightKeys`**

In `src/App.tsx`:

Add to the imports: `import type { PieceRef, Stage } from './core/solver/types';` (replacing the existing `import type { Stage } ...` line) and `import { targetPositions } from './view/piece-positions';`.

Extend `Solution`:

```ts
interface Solution {
  readonly stages: readonly Stage[];
  readonly moves: readonly Move[]; // flattened
  readonly stageStart: readonly number[]; // first move index of each stage
  readonly groupStart: readonly number[]; // first move index of each action group
  readonly groupWhy: readonly string[]; // parallel to groupStart
  readonly groupTargets: readonly (readonly PieceRef[])[]; // parallel to groupStart
  readonly snapshots: readonly CubeState[]; // length moves+1
}
```

Extend `buildSolution` (the loop gains one line; the return gains one field):

```ts
function buildSolution(cube: CubeState): Solution {
  const stages = solve(cube);
  const moves = stages.flatMap((st) => [...st.moves]);
  const stageStart: number[] = [];
  const groupStart: number[] = [];
  const groupWhy: string[] = [];
  const groupTargets: (readonly PieceRef[])[] = [];
  let acc = 0;
  for (const st of stages) {
    stageStart.push(acc);
    for (const g of st.groups) {
      groupStart.push(acc);
      groupWhy.push(g.why);
      groupTargets.push(g.targets);
      acc += g.moves.length;
    }
  }
  return {
    stages,
    moves,
    stageStart,
    groupStart,
    groupWhy,
    groupTargets,
    snapshots: buildSnapshots(cube, moves),
  };
}
```

In the `App` component body, replace the current `actionWhy` derivation with a shared group index, and add the highlight set (note `useMemo` is already imported):

```ts
  const hasSolution = s.solution !== null && s.solution.moves.length > 0;
  const currentStage = hasSolution ? stageIndexAt(s.solution!.stageStart, s.moveIndex) : -1;
  const groupIndex =
    hasSolution && s.moveIndex < s.solution!.moves.length
      ? stageIndexAt(s.solution!.groupStart, s.moveIndex)
      : -1;
  const actionWhy = groupIndex >= 0 ? s.solution!.groupWhy[groupIndex] : null;
  const highlightKeys = useMemo(
    () =>
      new Set(
        groupIndex >= 0
          ? targetPositions(s.cube, s.solution!.groupTargets[groupIndex]).map((p) => p.join(','))
          : [],
      ),
    [s.cube, s.solution, groupIndex],
  );
```

Pass it to CubeView: `<CubeView facelets={facelets} turn={turn} highlightKeys={highlightKeys} cueFace={null} />` (the real `cueFace` lands in Task 3 — pass the literal `null` for now).

- [ ] **Step 6: Add the glow shell and highlight prop to `src/view/CubeView.tsx`**

Add constants after the existing material constants block:

```ts
// --- Teaching highlights ----------------------------------------------------
// Glow shell: translucent rounded box slightly larger than the cubelet body.
const HIGHLIGHT_COLOR = '#EA580C'; // solve accent orange
const CUE_COLOR = '#4F46E5'; // primary indigo
const SHELL_SCALE = 1.12;
const SHELL_SIZE = CUBELET_SIZE * SHELL_SCALE;
const SHELL_RADIUS = BODY_CORNER_RADIUS * SHELL_SCALE;
const HIGHLIGHT_MIN_OPACITY = 0.18;
const HIGHLIGHT_MAX_OPACITY = 0.45;
const CUE_OPACITY = 0.12;
const SHELL_EMISSIVE_INTENSITY = 0.7;
const PULSE_HZ = 1; // one breathe per second

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Add `MeshStandardMaterial` to the three import: `import { MeshStandardMaterial, Quaternion, Shape, ShapeGeometry, Vector3, type Group } from 'three';`

Add the shell component above `Cubelet`:

```tsx
interface GlowShellProps {
  color: string;
  minOpacity: number;
  maxOpacity: number;
  pulse: boolean;
}

/** Translucent glow box around a cubelet; opacity breathes when `pulse` is on. */
function GlowShell({ color, minOpacity, maxOpacity, pulse }: GlowShellProps) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!pulse || !mat.current) return;
    const t = (Math.sin(clock.elapsedTime * 2 * Math.PI * PULSE_HZ) + 1) / 2;
    mat.current.opacity = minOpacity + t * (maxOpacity - minOpacity);
  });
  return (
    <RoundedBox args={[SHELL_SIZE, SHELL_SIZE, SHELL_SIZE]} radius={SHELL_RADIUS} smoothness={BODY_SMOOTHNESS}>
      <meshStandardMaterial
        ref={mat}
        color={color}
        emissive={color}
        emissiveIntensity={SHELL_EMISSIVE_INTENSITY}
        transparent
        opacity={(minOpacity + maxOpacity) / 2}
        depthWrite={false}
      />
    </RoundedBox>
  );
}
```

Extend `Cubelet` — props gain `highlight: boolean; tinted: boolean`, and the shell renders inside the cubelet's `<group>` (pulse wins over tint):

```tsx
interface CubeletProps {
  pos: Vec3;
  facelets: FaceName[];
  highlight: boolean;
  tinted: boolean;
}
```

```tsx
const Cubelet = memo(function Cubelet({ pos, facelets, highlight, tinted }: CubeletProps) {
```

and just before the closing `</group>`:

```tsx
      {highlight ? (
        <GlowShell
          color={HIGHLIGHT_COLOR}
          minOpacity={HIGHLIGHT_MIN_OPACITY}
          maxOpacity={HIGHLIGHT_MAX_OPACITY}
          pulse={!REDUCED_MOTION}
        />
      ) : tinted ? (
        <GlowShell color={CUE_COLOR} minOpacity={CUE_OPACITY} maxOpacity={CUE_OPACITY} pulse={false} />
      ) : null}
```

Extend `CubeViewProps` and wire both cubelet render sites (`still.map` and the `turning.map` inside `TurningGroup`):

```tsx
interface CubeViewProps {
  facelets: FaceName[];
  turn: Turn | null;
  highlightKeys: ReadonlySet<string>; // 'x,y,z' grid keys of glowing cubelets
  cueFace: Face | null; // layer about to rotate / rotating (null = no cue)
}
```

```tsx
export function CubeView({ facelets, turn, highlightKeys, cueFace }: CubeViewProps) {
```

Both `.map` call sites become:

```tsx
          <Cubelet
            key={p.join(',')}
            pos={p}
            facelets={facelets}
            highlight={highlightKeys.has(p.join(','))}
            tinted={cueFace !== null && FACE_SELECTOR[cueFace](p)}
          />
```

(`useRef` and `useFrame` are already imported in this file.)

- [ ] **Step 7: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all green (69 unit tests), no lint errors, build passes.

- [ ] **Step 8: Manual smoke check**

Run dev server if not already running (`npm run dev`), open http://localhost:5173: Scramble → Solve → Play. Expected: during each action an orange glow shell pulses on the piece(s) the "Now:" caption talks about, and follows the piece between moves. No tint yet (cueFace is null).

- [ ] **Step 9: Commit**

```bash
git add src/view/piece-positions.ts src/view/piece-positions.test.ts src/App.tsx src/view/CubeView.tsx
git commit -m "feat: pulsing glow on the cubelets each action references"
```

---

## Task 3: Layer cue + e2e coverage

**Depends on:** Task 2 (CubeView already accepts `cueFace`)

**Files:**
- Modify: `src/App.tsx` (cueFace derivation, `data-cue-face` attribute, pass to CubeView)
- Test: `e2e/journey.spec.ts` (append one test)

- [ ] **Step 1: Append the failing e2e test**

Append to `e2e/journey.spec.ts`:

```ts
test('app exposes the upcoming move face as a layer cue while paused', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });

  // No solve yet: no cue.
  await expect(app).not.toHaveAttribute('data-cue-face', /./);

  await page.getByTestId('solve').click();
  await page.getByTestId('stage-seg-0').click(); // paused at the start, first move pending
  await expect(app).toHaveAttribute('data-cue-face', /^[UDRLFB]$/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test -g "layer cue"`
Expected: FAIL — `data-cue-face` never appears.

- [ ] **Step 3: Derive `cueFace` in `src/App.tsx`**

Add `import type { Face, Move } from './core/cube-model/moves';` (extend the existing Move import).

After the `highlightKeys` derivation:

```ts
  // Layer cue: the face of the move that is animating (PLAYING) or pending
  // (PAUSED / dwelling). Covers play, dwell, stage pauses, seek, and stepping.
  const cueFace: Face | null =
    hasSolution &&
    s.moveIndex < s.solution!.moves.length &&
    (s.phase === 'PLAYING' || s.phase === 'PAUSED')
      ? s.solution!.moves[s.moveIndex].face
      : null;
```

Wire it up — root div gains the attribute (undefined removes it entirely):

```tsx
      data-cue-face={cueFace ?? undefined}
```

and replace the Task 2 placeholder: `<CubeView facelets={facelets} turn={turn} highlightKeys={highlightKeys} cueFace={cueFace} />`.

- [ ] **Step 4: Run the new e2e test**

Run: `npx playwright test -g "layer cue"`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run build && npm run e2e`
Expected: 69 unit tests pass, lint/build clean, 7/7 e2e pass.

- [ ] **Step 6: Manual smoke check**

In the browser: Solve, then before pressing Play the first move's layer shows a faint indigo film; during playback the rotating layer keeps it; during dwells the next layer tints; the orange pulse overrides the film on overlapping cubelets. At SOLVED everything clears.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx e2e/journey.spec.ts
git commit -m "feat: indigo layer cue for the upcoming or rotating face"
```

---

## Final verification (whole feature)

1. `npm test` — 69 unit tests green (61 existing + 2 emitter + 6 piece-positions).
2. `npm run lint && npm run build` — clean (core boundary rule still satisfied: `PieceRef` is plain data).
3. `npm run e2e` — 7/7 green; all pre-existing `data-testid`s untouched.
4. Manual: scramble → solve → play at each speed; seek and arrow-key step; reduced-motion (macOS: System Settings → Accessibility → Display → Reduce motion) shows static glow instead of pulse.
