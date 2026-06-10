# Teach the Solve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the user *why* the solve is split into six stages and what each stage means, via a responsive teaching panel that updates as playback crosses stage boundaries.

**Architecture:** Pure view-layer feature. Static per-stage "what & why" content (`teaching.ts`) rendered by one responsive component (`TeachingPanel.tsx`) — a compact card above the control bar on mobile, a left rail with the full 6-stage roadmap on desktop. Shared `STAGE_COLORS` + `stageIndexAt` extracted so `ControlPanel` and the panel agree. No `src/core/**`, reducer, or animation changes.

**Tech Stack:** React 19, TypeScript, Tailwind v4 + DaisyUI v5, Hugeicons, Vitest, Playwright.

---

## File Structure

- `src/view/stage-colors.ts` (new) — single source of the 6 stage colors.
- `src/view/stage-index.ts` (new) — `stageIndexAt(stageStart, moveIndex)`.
- `src/view/stage-index.test.ts` (new) — unit tests for the helper.
- `src/view/teaching.ts` (new) — `METHOD_INTRO`, `STAGE_LESSONS`, `StageLesson`.
- `src/view/teaching.test.ts` (new) — every stage has non-empty copy.
- `src/view/TeachingPanel.tsx` (new) — responsive teaching panel.
- `src/view/ControlPanel.tsx` (modify) — import shared `STAGE_COLORS` + `stageIndexAt`; drop the absolute positioning from its outer wrapper (App now stacks it).
- `src/App.tsx` (modify) — compute `currentStage`, render the bottom stack (`TeachingPanel` above `ControlPanel`).
- `src/view/icons.ts` (modify) — export `ChevronDownIcon`/`ChevronUpIcon`.
- `e2e/journey.spec.ts` (modify) — assert the teaching panel reacts to stage changes.

## Hard constraints (do not break)

- `src/core/**` untouched. `teaching.ts` may only `import type { StageName }` from core (type-only — no runtime/react/three).
- Preserve every existing `data-testid` verbatim (see spec). Only **add** `teaching-panel` (+ `stage-roadmap-{i}` on the desktop rail).
- No emoji — chevron via Hugeicons.
- Reducer / playback / `CubeView` animation unchanged.

---

### Task 1: Shared stage helpers (colors + stage-index), refactor ControlPanel to use them

**Depends on:** none (walking skeleton — Tasks 4 & 5 reuse these).

Extracts the two pieces that `ControlPanel` and the new panel must share, with no behavior change. Independently verifiable: existing tests + e2e stay green.

**Files:**
- Create: `src/view/stage-colors.ts`
- Create: `src/view/stage-index.ts`
- Create: `src/view/stage-index.test.ts`
- Modify: `src/view/ControlPanel.tsx`

- [ ] **Step 1: Write the failing test for `stageIndexAt`**

Create `src/view/stage-index.test.ts`:

```ts
import { expect, test } from 'vitest';
import { stageIndexAt } from './stage-index';

// Two stages: stage 0 owns moves [0,3), stage 1 owns [3,..).
const STARTS = [0, 3];

test('returns 0 before the second stage begins', () => {
  expect(stageIndexAt(STARTS, 0)).toBe(0);
  expect(stageIndexAt(STARTS, 2)).toBe(0);
});

test('returns the later stage at and past its boundary', () => {
  expect(stageIndexAt(STARTS, 3)).toBe(1);
  expect(stageIndexAt(STARTS, 9)).toBe(1);
});

test('handles a single stage starting at 0', () => {
  expect(stageIndexAt([0], 0)).toBe(0);
  expect(stageIndexAt([0], 50)).toBe(0);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/view/stage-index.test.ts`
Expected: FAIL — cannot resolve `./stage-index`.

- [ ] **Step 3: Implement `stage-index.ts`**

Create `src/view/stage-index.ts` (logic copied verbatim from the current `ControlPanel.stageIndexAt`):

```ts
/**
 * Index of the stage that owns move `moveIndex`, given each stage's first-move
 * offset (`stageStart`). Walks the offsets and keeps the last one not exceeding
 * `moveIndex`. Returns 0 for a single-stage / zero start list.
 */
export function stageIndexAt(stageStart: readonly number[], moveIndex: number): number {
  let idx = 0;
  stageStart.forEach((s, i) => {
    if (moveIndex >= s) idx = i;
  });
  return idx;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/view/stage-index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `stage-colors.ts`**

Create `src/view/stage-colors.ts` (values moved verbatim from `ControlPanel`):

```ts
// Per-stage colors for the timeline segments and the teaching roadmap,
// indexed to STAGE_NAMES order. Single source of truth — imported by both
// ControlPanel and TeachingPanel.
export const STAGE_COLORS: readonly string[] = [
  '#f6e58d',
  '#ffbe76',
  '#ff7979',
  '#badc58',
  '#7ed6df',
  '#e056fd',
];
```

- [ ] **Step 6: Refactor `ControlPanel.tsx` to use the shared modules**

In `src/view/ControlPanel.tsx`:

Replace the local `STAGE_COLORS` const (lines 14-21) and add the helper import. Top of file imports become:

```ts
import { STAGE_NAMES, type Stage } from '../core/solver/types';
import { STAGE_COLORS } from './stage-colors';
import { stageIndexAt } from './stage-index';
import {
  HugeiconsIcon,
  ScrambleIcon,
  SolveIcon,
  PrevStageIcon,
  StepBackIcon,
  PlayIcon,
  PauseIcon,
  StepForwardIcon,
  NextStageIcon,
} from './icons';

const LAST_STAGE_INDEX = STAGE_NAMES.length - 1;
```

(Delete the old `const STAGE_COLORS = [...]` block entirely.)

Then replace the inline `stageIndexAt` arrow inside `ControlPanel` (lines 43-49) so it delegates to the shared helper:

```ts
  const haveSolution = p.stages !== null && p.totalMoves > 0;
  const curStage = haveSolution ? stageIndexAt(p.stageStart, p.moveIndex) : -1;
  const atEnd = p.moveIndex >= p.totalMoves;
```

Leave everything else in `ControlPanel` unchanged (the outer wrapper changes in Task 3).

- [ ] **Step 7: Verify lint, build, full unit suite, e2e all green**

Run: `npm run lint && npm run build && npm test`
Expected: lint clean, build passes, all unit tests pass (including the new 3).

Run: `npm run e2e`
Expected: both journeys pass (proves the ControlPanel refactor changed nothing observable).

- [ ] **Step 8: Commit**

```bash
git add src/view/stage-colors.ts src/view/stage-index.ts src/view/stage-index.test.ts src/view/ControlPanel.tsx
git commit -m "refactor: extract shared STAGE_COLORS and stageIndexAt for reuse"
```

---

### Task 2: Teaching content module

**Depends on:** none.

Pure data: the per-stage lessons + method intro the panel will render. Independently verifiable by unit test.

**Files:**
- Create: `src/view/teaching.ts`
- Create: `src/view/teaching.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/view/teaching.test.ts`:

```ts
import { expect, test } from 'vitest';
import { STAGE_NAMES } from '../core/solver/types';
import { METHOD_INTRO, STAGE_LESSONS } from './teaching';

test('every stage has a non-empty goal and why', () => {
  for (const name of STAGE_NAMES) {
    const lesson = STAGE_LESSONS[name];
    expect(lesson, `missing lesson for ${name}`).toBeDefined();
    expect(lesson.goal.trim().length).toBeGreaterThan(0);
    expect(lesson.why.trim().length).toBeGreaterThan(0);
  }
});

test('method intro is non-empty', () => {
  expect(METHOD_INTRO.trim().length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/view/teaching.test.ts`
Expected: FAIL — cannot resolve `./teaching`.

- [ ] **Step 3: Implement `teaching.ts`**

Create `src/view/teaching.ts`:

```ts
import type { StageName } from '../core/solver/types';

export interface StageLesson {
  /** What the cube looks like once this stage is done (1 line). */
  readonly goal: string;
  /** Why this stage exists and why it comes here in the method (1-2 lines). */
  readonly why: string;
}

// Why layer-by-layer at all — shown as framing before a solve starts.
export const METHOD_INTRO: string =
  "This is the beginner layer-by-layer method: solve the cube one layer at a " +
  "time, bottom to top. Each stage locks in progress without disturbing what's " +
  'already solved — building from a white cross up to the final yellow layer.';

// One lesson per StageName. Keyed by name (not index) so it stays correct even
// if STAGE_NAMES order ever changes.
export const STAGE_LESSONS: Record<StageName, StageLesson> = {
  Daisy: {
    goal: 'A daisy on top: four white edges arranged around the yellow center.',
    why:
      'Making the white cross directly is fiddly. A daisy is easy to build first, ' +
      'and each white petal then drops straight down into its place on the cross.',
  },
  Cross: {
    goal: 'A white cross on the bottom, each edge matching its side center.',
    why:
      'Folding the daisy petals down gives a solved cross aligned to the centers. ' +
      'This is the foundation every later stage builds on.',
  },
  'First Layer': {
    goal: 'The whole bottom (white) layer done — cross plus its four corners.',
    why:
      'We slot the four white corners between the cross and their matching side ' +
      'colors, finishing the first layer so the cube has a solid solved base.',
  },
  'Second Layer': {
    goal: 'The middle layer solved — its four edges seated in place.',
    why:
      'We bring the middle-layer edges down from the top without disturbing the ' +
      'finished first layer, leaving only the last (yellow) layer to go.',
  },
  OLL: {
    goal: 'The entire top face one solid color (yellow).',
    why:
      'OLL means Orient Last Layer. We make the top all-yellow first — getting ' +
      'every piece facing the right way before worrying about where it belongs.',
  },
  PLL: {
    goal: 'The last layer fully solved — the whole cube complete.',
    why:
      'PLL means Permute Last Layer. With the top oriented, we shuffle the ' +
      'last-layer pieces into their correct positions to finish the solve.',
  },
};
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/view/teaching.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/view/teaching.ts src/view/teaching.test.ts
git commit -m "feat: add per-stage teaching content and method intro"
```

---

### Task 3: Mobile teaching panel wired into the solve

**Depends on:** Task 1 (shared helpers), Task 2 (content).

Delivers the core value on mobile: during a solve, a compact collapsible card above the control bar explains the current stage's goal + why; before a solve it shows a one-line framing hint. Desktop still renders this mobile card for now (Task 4 adds the rail). Independently testable through the UI.

**Files:**
- Modify: `src/view/icons.ts`
- Create: `src/view/TeachingPanel.tsx`
- Modify: `src/view/ControlPanel.tsx` (outer wrapper only)
- Modify: `src/App.tsx`

- [ ] **Step 1: Add chevron icons**

In `src/view/icons.ts`, add to the `@hugeicons/core-free-icons` re-export block:

```ts
  ArrowDown01Icon as ChevronDownIcon,
  ArrowUp01Icon as ChevronUpIcon,
```

(Insert alongside the existing aliases, before the closing `} from '@hugeicons/core-free-icons';`.)

- [ ] **Step 2: Create `TeachingPanel.tsx` (mobile card form)**

Create `src/view/TeachingPanel.tsx`:

```tsx
import { useState } from 'react';
import type { Stage } from '../core/solver/types';
import { METHOD_INTRO, STAGE_LESSONS } from './teaching';
import { HugeiconsIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface TeachingPanelProps {
  stages: readonly Stage[] | null;
  currentStage: number; // index into stages, or -1 when there is no solution
  hasSolution: boolean;
}

export function TeachingPanel({ stages, currentStage, hasSolution }: TeachingPanelProps) {
  const [open, setOpen] = useState(true);
  const lesson =
    hasSolution && stages && currentStage >= 0 ? STAGE_LESSONS[stages[currentStage].name] : null;

  return (
    <div
      data-testid="teaching-panel"
      className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-base-200/80 p-3 shadow-2xl ring-1 ring-base-content/10 backdrop-blur-md sm:p-4"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-display text-sm font-semibold opacity-80">
          {lesson ? 'Why this step' : 'How the solve works'}
        </span>
        <span className="btn btn-ghost btn-xs btn-circle" aria-hidden>
          <HugeiconsIcon icon={open ? ChevronUpIcon : ChevronDownIcon} size={18} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div className="mt-2 text-sm leading-snug">
          {lesson ? (
            <>
              <p className="font-medium">{lesson.goal}</p>
              <p className="mt-1 opacity-70">{lesson.why}</p>
            </>
          ) : (
            <p className="opacity-70">{METHOD_INTRO}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

Note: the collapse toggle is a real `<button>` whose hit area spans the full panel width and whose height (text + padding) exceeds 44px, satisfying the touch-target rule. The inner `span.btn` is decorative (`aria-hidden`).

- [ ] **Step 3: Make `ControlPanel` stackable (outer wrapper only)**

In `src/view/ControlPanel.tsx`, change ONLY the outermost wrapper `div` (currently line 54) from:

```tsx
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-4">
```

to:

```tsx
    <div className="flex w-full justify-center">
```

Positioning + padding now come from the App bottom-stack container (next step). The inner `pointer-events-auto` card and all testids stay exactly as they are.

- [ ] **Step 4: Wire the bottom stack into `App.tsx`**

In `src/App.tsx`:

Add imports near the existing view imports (after line 14):

```ts
import { TeachingPanel } from './view/TeachingPanel';
import { stageIndexAt } from './view/stage-index';
```

Inside `App`, after `currentMove` is computed (after line 199), derive the current stage:

```ts
  const hasSolution = s.solution !== null && s.solution.moves.length > 0;
  const currentStage = hasSolution ? stageIndexAt(s.solution!.stageStart, s.moveIndex) : -1;
```

Replace the standalone `<ControlPanel .../>` element (lines 234-248) with a bottom-stack container that holds the teaching panel above it:

```tsx
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-3 sm:p-4">
        <TeachingPanel
          stages={s.solution?.stages ?? null}
          currentStage={currentStage}
          hasSolution={hasSolution}
        />
        <ControlPanel
          phase={s.phase}
          stages={s.solution?.stages ?? null}
          stageStart={s.solution?.stageStart ?? []}
          moveIndex={s.moveIndex}
          totalMoves={s.solution?.moves.length ?? 0}
          speed={s.speed}
          currentMove={currentMove}
          onScramble={onScramble}
          onSolve={onSolve}
          onPlay={onPlay}
          onPause={onPause}
          onSeek={onSeek}
          onSpeed={onSpeed}
        />
      </div>
```

(The container is `pointer-events-none`; each child re-enables pointer events on its own card, so OrbitControls keeps the gaps clickable.)

- [ ] **Step 5: Verify lint, build, unit suite**

Run: `npm run lint && npm run build && npm test`
Expected: all green. Watch the core boundary lint rule — `teaching.ts` uses a type-only import, which is allowed; if lint flags it, ensure the import reads `import type { StageName }`.

- [ ] **Step 6: Manual check (mobile width)**

Run: `npm run dev`, open `http://localhost:5173`, set the viewport to ~375px.
Expected: before Solve the panel shows the method intro and collapses/expands via the chevron; after Scramble → Solve the panel shows the current stage's goal + why; stepping/seeking across a stage boundary (via `stage-seg-{i}` or scrub) changes the text; the cube stays visible above the stack.

- [ ] **Step 7: Commit**

```bash
git add src/view/icons.ts src/view/TeachingPanel.tsx src/view/ControlPanel.tsx src/App.tsx
git commit -m "feat: teaching panel explains the current solve stage"
```

---

### Task 4: Desktop rail with the 6-stage roadmap

**Depends on:** Task 3.

Progressive enhancement: at `sm`+ the teaching content moves to a left rail showing the full roadmap (all six stages, current highlighted with its color chip) plus the active stage detail. The mobile card hides at `sm`+; the rail hides below `sm`.

**Files:**
- Modify: `src/view/TeachingPanel.tsx`

- [ ] **Step 1: Extract shared lesson body and add the desktop rail**

Rewrite `src/view/TeachingPanel.tsx` so one content body is reused, the mobile card is `sm:hidden`, and a `hidden sm:flex` fixed left rail renders the roadmap:

```tsx
import { useState } from 'react';
import { STAGE_NAMES, type Stage } from '../core/solver/types';
import { METHOD_INTRO, STAGE_LESSONS } from './teaching';
import { STAGE_COLORS } from './stage-colors';
import { HugeiconsIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface TeachingPanelProps {
  stages: readonly Stage[] | null;
  currentStage: number; // index into stages, or -1 when there is no solution
  hasSolution: boolean;
}

function activeLesson(stages: readonly Stage[] | null, currentStage: number, hasSolution: boolean) {
  return hasSolution && stages && currentStage >= 0 ? STAGE_LESSONS[stages[currentStage].name] : null;
}

export function TeachingPanel({ stages, currentStage, hasSolution }: TeachingPanelProps) {
  const [open, setOpen] = useState(true);
  const lesson = activeLesson(stages, currentStage, hasSolution);

  const detail = lesson ? (
    <>
      <p className="font-medium">{lesson.goal}</p>
      <p className="mt-1 opacity-70">{lesson.why}</p>
    </>
  ) : (
    <p className="opacity-70">{METHOD_INTRO}</p>
  );

  return (
    <>
      {/* Mobile: compact collapsible card stacked above the control bar. */}
      <div
        data-testid="teaching-panel"
        className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-base-200/80 p-3 shadow-2xl ring-1 ring-base-content/10 backdrop-blur-md sm:p-4 lg:hidden"
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="font-display text-sm font-semibold opacity-80">
            {lesson ? 'Why this step' : 'How the solve works'}
          </span>
          <span className="btn btn-ghost btn-xs btn-circle" aria-hidden>
            <HugeiconsIcon icon={open ? ChevronUpIcon : ChevronDownIcon} size={18} strokeWidth={2} />
          </span>
        </button>
        {open && <div className="mt-2 text-sm leading-snug">{detail}</div>}
      </div>

      {/* Desktop: fixed left rail with the full roadmap + active detail. */}
      <div className="pointer-events-none fixed left-3 top-1/2 z-10 hidden w-72 -translate-y-1/2 lg:block">
        <div className="pointer-events-auto rounded-2xl bg-base-200/80 p-4 shadow-2xl ring-1 ring-base-content/10 backdrop-blur-md">
          <h2 className="font-display text-base font-semibold">The beginner method</h2>
          <ol className="mt-3 flex flex-col gap-1.5">
            {STAGE_NAMES.map((name, i) => {
              const active = hasSolution && i === currentStage;
              return (
                <li
                  key={name}
                  data-testid={`stage-roadmap-${i}`}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-opacity ${
                    active ? 'bg-base-content/10 font-semibold' : 'opacity-60'
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: STAGE_COLORS[i] }}
                    aria-hidden
                  />
                  {name}
                </li>
              );
            })}
          </ol>
          <div className="mt-3 border-t border-base-content/10 pt-3 text-sm leading-snug">
            {detail}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify lint, build, unit suite**

Run: `npm run lint && npm run build && npm test`
Expected: all green.

- [ ] **Step 3: Manual check (desktop + mobile)**

Run: `npm run dev`.
Expected (desktop ≥1024px): left rail lists all six stages; before Solve none highlighted and detail shows the intro; after Solve the active stage row highlights and its detail shows; orbit/drag still works in the area around the rail (gaps are `pointer-events-none`). Phone/tablet (<1024px, e.g. 375px and 768px): rail hidden, the collapsible card behaves as in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/view/TeachingPanel.tsx
git commit -m "feat: desktop teaching rail with stage roadmap"
```

---

### Task 5: E2E coverage for the teaching panel

**Depends on:** Task 4 (the first test asserts on the desktop rail's `stage-roadmap-{i}`).

Two deterministic tests: (1) the desktop rail highlights the stage being viewed and the highlight moves when you seek — proves the teaching surface is present and reactive without comparing localized copy; (2) the mobile card is visible after a solve — keeps the `teaching-panel` testid live. All existing testids stay green.

**Files:**
- Modify: `e2e/journey.spec.ts`

- [ ] **Step 1: Add the deterministic rail test**

Append to `e2e/journey.spec.ts`:

```ts
test('teaching rail highlights the stage being viewed and moves with seeking', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', {
    timeout: 30_000,
  });
  await page.getByTestId('solve').click();

  // Default Playwright viewport (1280x720) is >= lg, so the desktop rail renders.
  const firstRow = page.getByTestId('stage-roadmap-0');
  const lastRow = page.getByTestId('stage-roadmap-5');
  await expect(firstRow).toBeVisible();

  // Seek to the first stage: its row is active (font-semibold), the last is not.
  await page.getByTestId('stage-seg-0').click();
  await expect(firstRow).toHaveClass(/font-semibold/);
  await expect(lastRow).not.toHaveClass(/font-semibold/);

  // Seek to the last stage: the highlight moves.
  await page.getByTestId('stage-seg-5').click();
  await expect(lastRow).toHaveClass(/font-semibold/);
  await expect(firstRow).not.toHaveClass(/font-semibold/);
});
```

This is deterministic regardless of scramble: the active-row highlight is driven by `currentStage`, which `stage-seg-0`/`stage-seg-5` set directly via seek. The `font-semibold` class appears only on the active row (see the Task 4 `TeachingPanel` template).

- [ ] **Step 2: Add the mobile card presence test**

Append to `e2e/journey.spec.ts`:

```ts
test('teaching card is visible on mobile after a solve', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // < lg → mobile card, not the rail
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', {
    timeout: 30_000,
  });
  await page.getByTestId('solve').click();
  await expect(page.getByTestId('teaching-panel')).toBeVisible();
});
```

At 390px the rail is `lg:hidden`'s counterpart (hidden) and only the mobile card renders, so `teaching-panel` resolves to exactly one element (no strict-mode clash).

- [ ] **Step 3: Run e2e, verify both new tests pass and the rest stay green**

Run: `npm run e2e`
Expected: all journeys pass, including the two new teaching tests.

- [ ] **Step 4: Commit**

```bash
git add e2e/journey.spec.ts
git commit -m "test: e2e covers teaching rail highlight and mobile card presence"
```

---

## Known behavior (accepted for v1)

- **Zero-move stages are skipped in the panel.** A stage can legitimately emit
  0 moves (e.g. a scramble that leaves the last layer already oriented → OLL
  emits nothing). Because `stageIndexAt` returns the last stage offset `<=`
  moveIndex, a 0-move stage shares its start with the next stage and so never
  highlights and its lesson never displays during playback. This is accepted:
  a 0-move stage did no work, so skipping its narration is reasonable. Forcing
  a dwell on an empty stage would add timeline/reducer complexity for a rare
  case — out of scope for v1.

## Self-review notes

- **Spec coverage:** per-stage what/why content (Task 2), responsive panel mobile card + desktop roadmap (Tasks 3-4), wiring from existing state (Task 3), shared `STAGE_COLORS`/`stageIndexAt` (Task 1), e2e (Task 5), method intro pre-solve (Tasks 3-4). Deferred items (per-move why, piece highlighting, notation legend) intentionally excluded per spec.
- **Type consistency:** `TeachingPanelProps` identical across Tasks 3 and 4; `stageIndexAt(stageStart, moveIndex)` signature identical in helper, ControlPanel, and App; `STAGE_LESSONS` keyed by `StageName`.
- **Testid safety:** only `teaching-panel` (single element, mobile card) and `stage-roadmap-{i}` added; e2e pins a mobile viewport so `teaching-panel` is unambiguous. All existing testids untouched.
- **Boundary:** `teaching.ts` is the only new core touchpoint and uses `import type` only.
