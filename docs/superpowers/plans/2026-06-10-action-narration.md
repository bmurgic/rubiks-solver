# Action Narration & Paced Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every solve move belongs to a named action whose "why" shows live in the teaching panel, and playback takes a short dwell at each action boundary instead of breezing through.

**Architecture:** `Emitter` gains `action(why, fn)` brackets; all 6 stage solvers annotate their emission sites; `Stage` gains `groups: ActionGroup[]`. App flattens `groupStart`/`groupWhy` like `stageStart`, pauses turn scheduling for `DWELL_MS / speed` when playback crosses a group boundary, and feeds the current action's why to `TeachingPanel` as a "Now" line. Cleanup moves from per-stage to per-action.

**Tech Stack:** React 19, TypeScript, Tailwind v4 + DaisyUI v5, Vitest, Playwright.

**Branch:** `feat/teach-the-solve` (continue on it — this builds on the teaching panel).

---

## File Structure

- `src/core/solver/types.ts` (modify) — add `ActionGroup`; `Stage` gains `groups`.
- `src/core/solver/emitter.ts` (modify) — `action()`, `do()` guard, `toStage()`; absorbs `cleanup`.
- `src/core/solver/emitter.test.ts` (new) — bracket semantics.
- `src/core/solver/stages/{daisy,cross,first-layer,second-layer,oll,pll}.ts` (modify) — annotate emissions.
- `src/core/solver/solve.gate.test.ts` (modify) — groups invariants.
- `src/App.tsx` (modify) — `groupStart`/`groupWhy`, dwell state + effect, `actionWhy` prop.
- `src/view/TeachingPanel.tsx` (modify) — "Now" line + `teaching-rail` testid.
- `e2e/journey.spec.ts` (modify) — action-why visibility test.

## Hard constraints (do not break)

- `src/core/**` stays free of react/three imports.
- Every existing `data-testid` preserved; only ADD `action-why` and `teaching-rail`.
- No emoji. `data-phase` values unchanged (dwell is NOT a new phase).
- All existing unit + gate + e2e tests stay green (play-to-completion absorbs dwell time within its 120 s timeout).

---

### Task 1: Core — Emitter action brackets, annotated stages

**Depends on:** none.

The whole core migration must land in one task: `do()` outside an `action()` becomes an error and `Stage.groups` is required, so emitter + all 6 stages + tests change together. Mechanical — exact code below.

**Files:**
- Modify: `src/core/solver/types.ts`
- Modify: `src/core/solver/emitter.ts`
- Create: `src/core/solver/emitter.test.ts`
- Modify: `src/core/solver/stages/daisy.ts`, `cross.ts`, `first-layer.ts`, `second-layer.ts`, `oll.ts`, `pll.ts`
- Modify: `src/core/solver/solve.gate.test.ts`

- [ ] **Step 1: Write the failing emitter test**

Create `src/core/solver/emitter.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/core/solver/emitter.test.ts`
Expected: FAIL — `action`/`toStage` do not exist.

- [ ] **Step 3: Add `ActionGroup` to types**

In `src/core/solver/types.ts`, replace the `Stage` interface with:

```ts
export interface ActionGroup {
  /** Beginner-facing reason for this action (1 line). */
  readonly why: string;
  readonly moves: readonly Move[]; // cleaned; never empty
}

export interface Stage {
  readonly name: StageName;
  readonly groups: readonly ActionGroup[];
  readonly moves: readonly Move[]; // concatenation of group moves
}
```

- [ ] **Step 4: Implement the Emitter bracket API**

Rewrite `src/core/solver/emitter.ts`:

```ts
import type { CubeState } from '../cube-model/state';
import type { Move } from '../cube-model/moves';
import { apply } from '../cube-model/apply';
import { parse } from '../notation/notation';
import { cleanup } from './cleanup';
import { StageCapError, type ActionGroup, type Stage, type StageName } from './types';

const ROTATE_U_MAX_TURNS = 4;

export class Emitter {
  state: CubeState;
  readonly moves: Move[] = []; // raw, pre-cleanup (cap counts these)
  /** Inclusive — throws StageCapError on the (cap+1)th emitted move. */
  private readonly cap: number;
  readonly stage: StageName;
  private readonly groups: ActionGroup[] = [];
  private current: { why: string; start: number } | null = null;

  constructor(state: CubeState, cap: number, stage: StageName) {
    this.state = state;
    this.cap = cap;
    this.stage = stage;
  }

  /**
   * Bracket one narrated action: every do() inside `fn` belongs to `why`.
   * The slice is cleaned on close; fully-cancelled actions are dropped.
   */
  action(why: string, fn: () => void): void {
    if (this.current !== null) {
      throw new Error(`Emitter(${this.stage}): nested action() is not allowed`);
    }
    this.current = { why, start: this.moves.length };
    fn();
    const moves = cleanup(this.moves.slice(this.current.start));
    if (moves.length > 0) this.groups.push({ why, moves });
    this.current = null;
  }

  do(seq: string | readonly Move[]): void {
    if (this.current === null) {
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
```

Note: cleaned state semantics are identical — `cleanup` only merges/cancels same-face adjacents, so `stage.moves` applied to the input still reaches `e.state`.

- [ ] **Step 5: Run emitter tests, verify they pass**

Run: `npx vitest run src/core/solver/emitter.test.ts`
Expected: PASS (5 tests). (The rest of the suite is still red — stages don't compile yet.)

- [ ] **Step 6: Annotate `daisy.ts`**

In `src/core/solver/stages/daisy.ts`:
- Remove the `import { cleanup } from '../cleanup';` line.
- Replace `placeFromULayer`, `placeFromDLayer`, `placeFromELayer` bodies so each emission is bracketed:

```ts
function placeFromULayer(e: Emitter, slot: number): 'done' | 'continue' {
  const white = whiteEdgeFace(e.state, slot);
  if (white === 'U') return 'done';
  // White faces a side — drop into E layer through that side face.
  e.action('This petal is flipped — push it out into the middle layer.', () => e.do(white));
  return 'continue';
}

function placeFromDLayer(e: Emitter, slot: number): 'done' | 'continue' {
  const side = D_SLOT_SIDE[slot];
  const white = whiteEdgeFace(e.state, slot);
  if (white === 'D') {
    // Two-turn flip: rotate U so destination petal is free, then side2.
    const destSlot = U_SLOT_OF_FACE[side];
    if (destSlot === undefined) throw new StageCapError('Daisy', `no U slot for side ${side}`);
    e.action(
      'A white edge points down — spin the top to free its petal spot, then flip it up with a double turn.',
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
    () => e.do(side),
  );
  return 'continue';
}

function placeFromELayer(e: Emitter, slot: number): 'done' {
  const white = whiteEdgeFace(e.state, slot);
  const liftTable = E_LIFT[slot];
  const lift = liftTable?.[white as Face];
  if (lift === undefined) throw new StageCapError('Daisy', `no E-lift for slot ${slot}/${white}`);
  const destFace = lift[0] as Face;
  const destSlot = U_SLOT_OF_FACE[destFace];
  if (destSlot === undefined) throw new StageCapError('Daisy', `no U slot for face ${destFace}`);
  e.action('Make room on top, then lift the white edge up into the daisy.', () => {
    rotateUUntil(e, (s) => !isPetalAt(s, destSlot));
    e.do(lift);
  });
  return 'done';
}
```

- Replace the return in `solveDaisy`:

```ts
  return { stage: e.toStage(), state: e.state };
```

- [ ] **Step 7: Annotate `cross.ts`**

In `src/core/solver/stages/cross.ts`: remove the `cleanup` import; wrap the loop body emission and switch the return:

```ts
    rotateUUntil(e, (s) => edgeSlot(s, cubie) === destSlot);
    e.do(`${side}2`);
```

becomes

```ts
    e.action(
      'Spin the top so this petal lines up with its matching side center, then drop it down with a double turn.',
      () => {
        rotateUUntil(e, (s) => edgeSlot(s, cubie) === destSlot);
        e.do(`${side}2`);
      },
    );
```

and the return becomes `return { stage: e.toStage(), state: e.state };`.

- [ ] **Step 8: Annotate `first-layer.ts`**

In `src/core/solver/stages/first-layer.ts`: remove the `cleanup` import; in `insertCorner`:

```ts
function insertCorner(e: Emitter, cubie: number): void {
  // Eject if stuck in any D slot (wrong slot, or home slot but twisted).
  const slot = cornerSlot(e.state, cubie);
  if (slot >= D_LAYER_MIN_SLOT && !cornerSolved(e.state, cubie)) {
    e.action('This white corner is stuck in the bottom — run the trigger to pop it out.', () =>
      e.do(INSERT[slot].alg),
    );
  }
  const { alg, above } = INSERT[cubie];
  for (let i = 0; i < INSERT_TRIAL_GUARD && !cornerSolved(e.state, cubie); i++) {
    const cur = cornerSlot(e.state, cubie);
    if (cur === cubie) {
      // Home slot but twisted: run the alg again to re-eject and reinsert.
      e.action('The corner is in its slot but twisted — run the trigger again to re-seat it.', () =>
        e.do(alg),
      );
      continue;
    }
    e.action(
      'Spin the top until the corner sits over its home slot, then run the righty trigger.',
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

and the return in `solveFirstLayer` becomes `return { stage: e.toStage(), state: e.state };`.

- [ ] **Step 9: Annotate `second-layer.ts`**

In `src/core/solver/stages/second-layer.ts`: remove the `cleanup` import; wrap the two emission helpers and switch the return:

```ts
function ejectFromELayer(e: Emitter, slot: number): void {
  // Stuck in the E layer (wrong slot or flipped): eject by running that slot's
  // first case alg after parking a non-middle edge at its park slot so we
  // don't disturb other already-solved middle edges.
  const c0 = CASES[slot][0];
  const park = U_SLOT_OF_FACE[c0.alignFace];
  if (park === undefined) {
    throw new StageCapError('Second Layer', `no U slot for face ${c0.alignFace}`);
  }
  e.action('This middle edge is in the wrong slot — run the insert to eject it up top.', () => {
    rotateUUntil(e, (s) => !(MIDDLE_EDGES as readonly number[]).includes(s.ep[park]));
    e.do(c0.alg);
  });
}

function insertFromULayer(e: Emitter, cubie: number, slot: number): void {
  const align = sideColor(e.state, slot); // constant under U turns
  const dest = U_SLOT_OF_FACE[align];
  if (dest === undefined) {
    throw new StageCapError('Second Layer', `no U slot for face ${align}`);
  }
  const targetCase = CASES[cubie].find((c) => c.alignFace === align);
  if (!targetCase) {
    throw new StageCapError('Second Layer', `edge ${cubie} has no case for align face ${align}`);
  }
  e.action(
    'Match the edge with its side center, then send it down into its slot with the insert trigger.',
    () => {
      rotateUUntil(e, (s) => edgeSlot(s, cubie) === dest);
      e.do(targetCase.alg);
    },
  );
}
```

(Note: the `targetCase` lookup moves above the bracket — it reads `align`, not emitter state mutated inside, so behavior is identical.)
Return becomes `return { stage: e.toStage(), state: e.state };`.

- [ ] **Step 10: Annotate `oll.ts`**

In `src/core/solver/stages/oll.ts`: remove the `cleanup` import; rewrite the two look helpers:

```ts
function orientEdges(e: Emitter): void {
  // Three OLL edge cases: dot (0 oriented), L or line (2 oriented), cross (4).
  // Dot → run line alg once to get to L/line; L → run L alg; line → run line alg.
  for (let guard = 0; guard < OLL_EDGE_GUARD; guard++) {
    const count = orientedEdgeCount(e.state);
    if (count === 4) return;
    if (count === 0) {
      // Dot: any U setup works — F R U R' U' F' produces an L which the next
      // iteration will resolve.
      e.action('No yellow edges are up yet — run the edge algorithm once to get an L shape.', () =>
        e.do(F_SEXY_F),
      );
      continue;
    }
    if (count === 2) {
      if (isOppositeEdgePair(e.state)) {
        e.action(
          'Two yellow edges form a line — lay it flat, then run the edge algorithm to finish the yellow cross.',
          () => {
            // Line: rotate until the line lies horizontal (UR + UL oriented).
            rotateUUntil(e, (s) => edgeUp(s, Edge.UR) && edgeUp(s, Edge.UL));
            e.do(F_SEXY_F);
          },
        );
      } else {
        e.action(
          'Two yellow edges form an L — point it to the back-left, then run the mirrored edge algorithm.',
          () => {
            // L shape: rotate until the L sits at UB + UL (back/left oriented).
            rotateUUntil(e, (s) => edgeUp(s, Edge.UB) && edgeUp(s, Edge.UL));
            e.do(F_SEXY_PRIME_F);
          },
        );
      }
      continue;
    }
    // Unreachable by construction: a valid cube under Kociemba EO has an even
    // number of oriented U-edges, so count ∈ {0, 2, 4} only.
    throw new StageCapError('OLL', `impossible oriented-edge count ${count}`);
  }
  throw new StageCapError('OLL', 'edge orientation did not converge');
}

function orientCorners(e: Emitter): void {
  // Sune-only 2-look corner OLL. Anchor positioning rules at UFL:
  //   1 oriented → put the lone oriented corner at UFL
  //   0 oriented → put a corner whose U-sticker faces L at UFL ("headlights left")
  //   2 oriented → put a corner whose U-sticker faces F at UFL
  for (let guard = 0; guard < OLL_CORNER_GUARD; guard++) {
    const count = orientedCornerCount(e.state);
    if (count === 4) return;
    let why: string;
    let pred: (s: CubeState) => boolean;
    if (count === 1) {
      why = 'One yellow corner is done — park it at the front-left, then run the Sune.';
      pred = (s) => cornerUp(s, Corner.UFL);
    } else if (count === 0) {
      why = 'No yellow corners yet — set the anchor at the front-left, then run the Sune.';
      pred = (s) => cornerSticker(s, Corner.UFL, 'L') === 'U';
    } else {
      // count === 2
      why = 'Two yellow corners are done — set the anchor at the front-left, then run the Sune.';
      pred = (s) => cornerSticker(s, Corner.UFL, 'F') === 'U';
    }
    e.action(why, () => {
      rotateUUntil(e, pred);
      e.do(SUNE);
    });
  }
  throw new StageCapError('OLL', 'corner orientation did not converge');
}
```

Return in `solveOll` becomes `return { stage: e.toStage(), state: e.state };`.

- [ ] **Step 11: Annotate `pll.ts`**

In `src/core/solver/stages/pll.ts`: remove the `cleanup` import; rewrite the emission sites:

In `permuteCorners`, replace the loop body's emission:

```ts
    if (cornersPermutedUpToU(e.state)) return;
    const anyHeadlights = SIDE_FACES.some((f) => headlightsOn(e.state, f));
    if (anyHeadlights) {
      e.action(
        'Aim the matching corner pair (headlights) to the left, then swap the other two corners with the T-perm.',
        () => {
          rotateUUntil(e, (s) => headlightsOn(s, 'L'));
          e.do(T_PERM);
        },
      );
    } else {
      e.action('No matching corner pair yet — run the T-perm once to create one.', () =>
        e.do(T_PERM),
      );
    }
```

In `permuteEdges`, replace the loop body's emissions:

```ts
    // H/Z case (no edges home): a single U-perm leaves a 3-cycle for next pass.
    if (home.length === 0) {
      e.action('No top edges are in place — run a U-perm to leave just three to cycle.', () =>
        e.do(U_PERM_A),
      );
      continue;
    }
    // Exactly one edge home: park it at UB, then pick Ua/Ub by simulating both.
    e.action('Park the solved edge at the back, then cycle the last three edges with a U-perm.', () => {
      const turns = uTurnsToUB(home[0]);
      if (turns > 0) e.do(Array<string>(turns).fill('U').join(' '));
      const tryA = applyAll(e.state, parse(U_PERM_A));
      const aFixes = homeEdgesUnderSomeAuf(tryA);
      e.do(aFixes === U_CYCLE_LENGTH ? U_PERM_A : U_PERM_B);
      rotateUUntil(e, cornersHome); // AUF / realign after the cycle.
    });
```

In `solvePll`, wrap the inter-look alignment and switch the return:

```ts
  permuteCorners(e);
  // Align corners home; also serves as AUF as edges finish.
  e.action('Spin the top to line the corners up with their sides.', () =>
    rotateUUntil(e, cornersHome),
  );
  permuteEdges(e);
  if (!isSolved(e.state)) {
    // Unreachable by construction: permuteEdges throws on non-convergence.
    throw new StageCapError('PLL', 'did not converge');
  }
  return { stage: e.toStage(), state: e.state };
```

(That alignment action often emits 0 moves and is then dropped — by design.)

- [ ] **Step 12: Extend the solve gate test**

In `src/core/solver/solve.gate.test.ts`, add inside the existing seeded-scramble loop (after the current per-stage assertions; adapt to the file's actual structure):

```ts
      for (const stage of stages) {
        for (const g of stage.groups) {
          expect(g.why.trim().length).toBeGreaterThan(0);
          expect(g.moves.length).toBeGreaterThan(0);
        }
        expect(stage.groups.flatMap((g) => [...g.moves])).toEqual([...stage.moves]);
      }
```

- [ ] **Step 13: Full verification**

Run: `npm run lint && npm run build && npm test`
Expected: all green — emitter tests, all stage tests, gate test with the new invariants. (Solve lengths may differ slightly from before since cleanup no longer merges across actions — stage tests assert solvedness/caps, not exact move counts, so they must stay green; if a cap is exceeded, report BLOCKED, do not raise caps silently.)

Run: `npm run e2e`
Expected: all 5 existing journeys pass (view untouched; solutions still solve).

- [ ] **Step 14: Commit**

```bash
git add src/core/solver
git commit -m "feat: solver emits narrated action groups per stage"
```

---

### Task 2: Dwell pacing + "Now" caption in the teaching panel

**Depends on:** Task 1.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/view/TeachingPanel.tsx`

- [ ] **Step 1: Flatten groups in `buildSolution`**

In `src/App.tsx`, extend the `Solution` interface:

```ts
interface Solution {
  readonly stages: readonly Stage[];
  readonly moves: readonly Move[]; // flattened
  readonly stageStart: readonly number[]; // first move index of each stage
  readonly groupStart: readonly number[]; // first move index of each action group
  readonly groupWhy: readonly string[]; // parallel to groupStart
  readonly snapshots: readonly CubeState[]; // length moves+1
}
```

and `buildSolution`:

```ts
function buildSolution(cube: CubeState): Solution {
  const stages = solve(cube);
  const moves = stages.flatMap((st) => [...st.moves]);
  const stageStart: number[] = [];
  const groupStart: number[] = [];
  const groupWhy: string[] = [];
  let acc = 0;
  for (const st of stages) {
    stageStart.push(acc);
    for (const g of st.groups) {
      groupStart.push(acc);
      groupWhy.push(g.why);
      acc += g.moves.length;
    }
  }
  return { stages, moves, stageStart, groupStart, groupWhy, snapshots: buildSnapshots(cube, moves) };
}
```

(`acc` now advances per group; the per-stage sum is identical, so `stageStart` is unchanged.)

- [ ] **Step 2: Dwell state machine**

Add `const DWELL_MS = 800;` next to `PLAY_MS`.

`AppState` gains `isDwelling: boolean;` (comment: `// brief between-actions hold while PLAYING`), `INITIAL_STATE` gains `isDwelling: false`.

`Action` union gains `| { type: 'DWELL_DONE' }`.

Reducer changes:
- `SCRAMBLE`: add `isDwelling: false` to the returned object.
- `PAUSE`: returned object becomes `{ ...s, phase: 'PAUSED', isDwelling: false }`.
- `SEEK`: add `isDwelling: false` to the returned object.
- `PLAY_TURN_DONE`: after the stage-pause branch, add the group-dwell branch:

```ts
    case 'PLAY_TURN_DONE': {
      if (!s.solution) return s;
      const next = s.moveIndex + 1;
      const cube = s.solution.snapshots[next];
      if (next >= s.solution.moves.length) {
        return { ...s, cube, moveIndex: next, phase: 'SOLVED' };
      }
      // Pause at each stage boundary so the lesson can be read; Auto plays through.
      if (!s.autoContinue && s.solution.stageStart.includes(next)) {
        return { ...s, cube, moveIndex: next, phase: 'PAUSED' };
      }
      // Brief dwell at each action boundary so the caption can be read.
      if (s.solution.groupStart.includes(next)) {
        return { ...s, cube, moveIndex: next, isDwelling: true };
      }
      return { ...s, cube, moveIndex: next };
    }
```

- New case:

```ts
    case 'DWELL_DONE':
      return s.isDwelling ? { ...s, isDwelling: false } : s;
```

- [ ] **Step 3: Dwell timer effect + turn gating**

In `App`, after the keyboard effect, add:

```ts
  useEffect(() => {
    if (s.phase !== 'PLAYING' || !s.isDwelling) return;
    const t = setTimeout(() => dispatch({ type: 'DWELL_DONE' }), DWELL_MS / s.speed);
    return () => clearTimeout(t);
  }, [s.phase, s.isDwelling, s.speed]);
```

Gate turn scheduling on the flag — the `else if` becomes:

```ts
  } else if (
    s.phase === 'PLAYING' &&
    !s.isDwelling &&
    s.solution &&
    s.moveIndex < s.solution.moves.length
  ) {
```

- [ ] **Step 4: Derive and pass `actionWhy`**

After the `currentStage` line:

```ts
  const actionWhy =
    hasSolution && s.moveIndex < s.solution!.moves.length
      ? s.solution!.groupWhy[stageIndexAt(s.solution!.groupStart, s.moveIndex)]
      : null;
```

Pass it to the panel:

```tsx
        <TeachingPanel
          stages={s.solution?.stages ?? null}
          currentStage={currentStage}
          hasSolution={hasSolution}
          actionWhy={actionWhy}
        />
```

- [ ] **Step 5: "Now" line in `TeachingPanel`**

In `src/view/TeachingPanel.tsx`:
- `TeachingPanelProps` gains `actionWhy: string | null; // current action's why, null outside a solve`.
- Destructure it in the component signature.
- Extend the shared `detail` body — after the lesson goal/why (only in the lesson branch):

```tsx
  const detail = lesson ? (
    <>
      <p className="font-medium">{lesson.goal}</p>
      <p className="mt-1 opacity-70">{lesson.why}</p>
      {actionWhy && (
        <p data-testid="action-why" className="mt-2 border-t border-base-content/10 pt-2">
          <span className="font-display font-semibold">Now: </span>
          <span className="opacity-80">{actionWhy}</span>
        </p>
      )}
    </>
  ) : (
    <p className="opacity-70">{METHOD_INTRO}</p>
  );
```

- Add `data-testid="teaching-rail"` to the desktop rail's INNER card div (the one with `pointer-events-auto rounded-2xl ...`), so e2e can scope queries: `detail` renders in both the card and the rail, putting two `action-why` nodes in the DOM.

- [ ] **Step 6: Verification**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

Run: `npm run e2e`
Expected: all 5 journeys pass. The play-to-completion journey absorbs the dwell time (~30 groups × 0.4 s at 2× ≈ +12 s, well under its 120 s timeout). If it times out, report BLOCKED.

- [ ] **Step 7: Manual check**

`npm run dev` (or use the already-running server): Scramble → Solve → Play. Expected: moves arrive in chunks with a beat between actions; the "Now:" line updates at each beat; stage pause still happens (Auto off); speed 2× halves the dwell; mobile card shows the same "Now" line.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/view/TeachingPanel.tsx
git commit -m "feat: dwell at action boundaries and narrate the current action"
```

---

### Task 3: E2E coverage for action narration

**Depends on:** Task 2.

**Files:**
- Modify: `e2e/journey.spec.ts`

- [ ] **Step 1: Append the narration test**

```ts
test('teaching panel narrates the current action after a solve', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();

  // Seek to the start: the first action's why is showing in the desktop rail.
  await page.getByTestId('stage-seg-0').click();
  const why = page.getByTestId('teaching-rail').getByTestId('action-why');
  await expect(why).toBeVisible();
  await expect(why).toContainText(/\S/);
});
```

(Scoped through `teaching-rail` because the same `action-why` node also exists in the hidden mobile card — an unscoped `getByTestId` would hit Playwright strict mode with 2 elements.)

- [ ] **Step 2: Run e2e**

Run: `npm run e2e`
Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/journey.spec.ts
git commit -m "test: e2e covers action narration in the teaching panel"
```

---

## Known behavior (accepted)

- **Cross-action move merges no longer happen** — solutions may be a few moves
  longer than before. Each narrated action stays intact, which reads better.
- **Repeated captions are intentional** — trigger retries (e.g. First Layer's
  righty trigger) re-show the same why; repetition is part of the method.
- **The PLL alignment action often vanishes** — it emits 0-3 U moves; when 0,
  the group is dropped and never narrated.
- **Caption at a boundary names the upcoming action** — `stageIndexAt` semantics:
  at `moveIndex === groupStart[k]`, the shown why is group k, the action about
  to play. This matches the stage-pause behavior ("read, then play").

## Self-review notes

- **Spec coverage:** action brackets + 6 annotated stages (Task 1), dwell +
  caption (Task 2), e2e (Task 3). Grain = trigger/action per spec.
- **Type consistency:** `ActionGroup {why, moves}` used identically in types,
  emitter, gate test, buildSolution; `stageIndexAt(starts, moveIndex)` reused
  for groups (same generic last-start-≤-index contract).
- **Testid safety:** adds only `action-why` + `teaching-rail`; e2e scopes the
  duplicated node through the rail.
- **Boundary:** core gains zero react/three imports; narration is plain data.
