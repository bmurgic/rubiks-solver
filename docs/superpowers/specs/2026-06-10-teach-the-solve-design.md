# Teach the Solve — Design

**Date:** 2026-06-10
**Status:** Approved (brainstorming) → ready for plan

## Problem

The app animates a beginner-method solve (Daisy → Cross → First Layer →
Second Layer → OLL → PLL) and shows the current stage name + raw move
notation. It teaches nothing: a user watching has no idea *why* the solve is
split into these stages, *what* each stage accomplishes, or *why* a given
stage comes where it does. The solve plays as opaque motion.

## Goal

Help the user **understand the method**: why layer-by-layer, what each of the
six stages means, and what each one is for. Conceptual understanding of the
stage progression is the spine of this feature — not per-move mechanics.

## Scope

### In scope (v1)
- Per-stage "what & why" teaching content (static, view-layer).
- A short method-overview intro (why layer-by-layer).
- A responsive teaching panel that surfaces this content, updating as
  playback crosses stage boundaries.

### Out of scope (v1 — possible follow-ups)
- **Per-move / per-trigger "why" narration.** Pedagogically nice but requires
  the solver to emit per-trigger intent, touching every stage in
  `src/core/**`. Deferred. The data model below leaves room to add it later
  without rework.
- **Affected-piece highlighting on the 3D cube.** Deferred; would also benefit
  from solver intent for the "target" piece.
- **Notation legend.** Deferred; small, can be added to the panel later.

These three were discussed and explicitly pushed to follow-ups so v1 ships the
conceptual teaching the user actually asked for.

## Hard constraints (must not break)

- **`src/core/**` untouched** — eslint boundary forbids three/react there.
  v1 needs no core changes; all work is view-layer.
- **All existing `data-testid`s preserved verbatim** — e2e depends on them:
  `app` (+ `data-phase`/`data-solved`), `scramble`, `solve`, `play`, `pause`,
  `step-back`, `step-fwd`, `prev-stage`, `next-stage`, `scrub`, `stage-seg-{i}`,
  `stage-name`, `current-move`, `speed`, `reset-view`, `solve-error`.
- **No emoji anywhere** — chevron and any icons via Hugeicons (`src/view/icons`).
- Playback reducer / state machine / turn-animation unchanged — this is
  additive UI only.

## Architecture

Three pieces, all in `src/view/`:

### 1. Teaching content — `src/view/teaching.ts`
Pure data/constants (same "easy-to-tune named constants" pattern as
`colors.ts` / cube geometry). No React, no three.

```ts
import type { StageName } from '../core/solver/types';

export interface StageLesson {
  readonly goal: string; // what the cube looks like after this stage (1 line)
  readonly why: string;  // why this stage exists / why it comes here (1-2 lines)
}

// Short blurb: why layer-by-layer at all. Shown before solving as a preview.
export const METHOD_INTRO: string = '...';

// One entry per StageName. Keyed by name (not index) so it stays correct if
// STAGE_NAMES order ever changes.
export const STAGE_LESSONS: Record<StageName, StageLesson> = {
  Daisy: { goal: '...', why: '...' },
  Cross: { goal: '...', why: '...' },
  'First Layer': { goal: '...', why: '...' },
  'Second Layer': { goal: '...', why: '...' },
  OLL: { goal: '...', why: '...' },
  PLL: { goal: '...', why: '...' },
};
```

Importing the `StageName` *type* from core is allowed (type-only import, no
runtime/react/three dependency — does not violate the boundary).

Content is plain, friendly, beginner-facing. Each `goal`/`why` is one to two
short sentences. The writer fills real copy during implementation (the plan
will include the actual strings — no placeholders shipped).

### 2. Teaching panel — `src/view/TeachingPanel.tsx`
One component, content identical across breakpoints; only its **container
placement** changes. This is the mobile-first answer: it is not a true "side"
element on mobile.

**Props:**
```ts
interface TeachingPanelProps {
  stages: readonly Stage[] | null; // null before solve
  currentStage: number;            // index into stages; -1 if none
  hasSolution: boolean;
}
```

**Responsive behavior:**
- **Mobile (base):** compact, full-width card stacked directly *above* the
  existing control bar, inside the same bottom floating cluster. Same
  `bg-base-200/80 backdrop-blur` + rounded + ring styling as the control bar.
  Shows the **current stage's** `goal` + `why`. The stage *name* is not
  repeated here (it already shows on the control bar). Collapsible via a
  chevron button (Hugeicons; tap target ≥44px) so the cube stays visible;
  default expanded.
- **`sm`+ :** the same component reflows to a **left side rail** (fixed,
  `pointer-events-none` wrapper with a `pointer-events-auto` inner panel so
  OrbitControls still works in the empty space around it). Wider → also renders
  the **6-stage roadmap**: a vertical list of all stages, each with its
  `STAGE_COLORS` chip, the current one highlighted, above the active stage's
  `goal`/`why` detail.

So: mobile = current-stage card; desktop = roadmap + current-stage detail.
Identical text source, progressive enhancement via Tailwind breakpoints.

**Before solving (`hasSolution === false`):** the panel shows `METHOD_INTRO`
+ the roadmap preview (desktop) / a one-line "what you'll watch" hint
(mobile). This gives the lesson framing up front.

**`STAGE_COLORS`** currently lives privately in `ControlPanel.tsx`. The
roadmap chips must match those exact colors. Extract `STAGE_COLORS` into a
shared module (e.g. `src/view/stage-colors.ts`) and import it in both
`ControlPanel` and `TeachingPanel` — DRY, single source of truth.

### 3. Wiring — `src/App.tsx`
`App` already has `solution.stages`, `solution.stageStart`, `moveIndex`,
`phase`. Compute `currentStage` from `stageStart` + `moveIndex` (the same
logic `ControlPanel.stageIndexAt` uses). To avoid duplicating it a third time,
extract that helper into a small shared util (e.g.
`src/view/stage-index.ts`: `stageIndexAt(stageStart, moveIndex): number`) and
use it in `App` (to derive `currentStage` for the panel) and `ControlPanel`.

Render `<TeachingPanel>` as a sibling of `<ControlPanel>`. On mobile it visually
stacks above the control bar; achieve this by wrapping both in the same bottom
cluster, or by positioning the panel just above the control bar's fixed
position. No reducer/playback changes — the panel re-renders from existing
state and updates automatically as `moveIndex` crosses `stageStart` boundaries.

## Data flow

```
App state (moveIndex, solution.stages, solution.stageStart, phase)
  → stageIndexAt(stageStart, moveIndex) = currentStage
  → TeachingPanel(stages, currentStage, hasSolution)
      → STAGE_LESSONS[stages[currentStage].name]  → goal/why text
      → (before solve) METHOD_INTRO + roadmap preview
```

## Testing

- **Unit:** `teaching.ts` — assert `STAGE_LESSONS` has an entry for every
  `STAGE_NAMES` value with non-empty `goal`/`why` (guards against a missing
  stage). `stage-index.ts` — `stageIndexAt` returns correct index at, before,
  and on each boundary.
- **Component (optional, if a renderer is set up):** TeachingPanel shows the
  current stage's lesson; shows intro when `hasSolution` is false.
- **E2E (extend `e2e/journey.spec.ts`):** after Solve, assert a
  `data-testid="teaching-panel"` is visible and its text changes between two
  different stages (seek to stage 0 vs a later stage via existing
  `stage-seg-{i}` / `scrub`). Add `teaching-panel` testid (+ optional
  `stage-roadmap-{i}` on desktop roadmap rows). Existing testids untouched.

## New / changed files

- **Create:** `src/view/teaching.ts`, `src/view/TeachingPanel.tsx`,
  `src/view/stage-colors.ts`, `src/view/stage-index.ts`
  (+ unit test files for `teaching` and `stage-index`).
- **Modify:** `src/App.tsx` (compute `currentStage`, render panel),
  `src/view/ControlPanel.tsx` (import shared `STAGE_COLORS` + `stageIndexAt`
  instead of private copies), `e2e/journey.spec.ts` (assert teaching panel).
- **Untouched:** all of `src/core/**`, reducer/playback logic, `CubeView.tsx`,
  cube animation.

## Branch

Create `feat/teach-the-solve` before editing — do not implement on main.

## Verification

1. `npm run lint` — clean (watch the core import boundary: only a *type*
   import of `StageName` from core is allowed; no value imports).
2. `npm run build` — `tsc -b && vite build` passes.
3. `npm test` — existing unit tests green + new `teaching`/`stage-index` tests.
4. `npm run e2e` — journeys pass, including the new teaching-panel assertion.
5. `npm run dev` — manual: before Solve shows method intro + roadmap; during
   playback the panel updates per stage; mobile (375px) = compact collapsible
   card above the control bar with cube still visible; `sm`+ = left rail with
   roadmap + detail; no emoji; orbit still works around the desktop rail.
