# Play Button Tap vs Hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping the play button plays exactly one animated move then pauses; pressing and holding it for 600 ms starts continuous playback (firing at the threshold while still held); clicking while playing pauses at the current step (unchanged).

**Architecture:** The reducer's `PLAY` action gains a `mode: 'continuous' | 'single'` payload stored as `playMode` in state; `PLAY_TURN_DONE` in single mode transitions to PAUSED instead of continuing. Tap-vs-hold detection lives in a new `usePressHold` hook spread onto the play button. Playback machinery (turn animation, dwell, stage-boundary pause, auto-continue) is untouched for continuous mode.

**Tech Stack:** Vite + React 19 + TS, Playwright e2e (starts its own server).

**Spec:** `docs/superpowers/specs/2026-06-10-play-button-tap-hold-design.md`

**Branch:** `feat/teach-the-solve` (already checked out).

> **Post-execution deviation note (2026-06-10):** Steps 4-5 as written (a
> generic `usePressHold` hook spread on the conditional play button) failed
> against real pointer input for two reasons discovered during execution:
> (1) real/trusted pointer events never reach React's delegated
> `onPointerDown`/`onPointerUp` handlers in this app — native listeners are
> required; (2) firing play on pointerup re-renders before the trailing
> trusted `click` dispatches, and Chromium retargets that click to the
> swapped-in pause button, instantly pausing again (net no-op). The shipped
> implementation is `src/view/PlayPauseButton.tsx`: one persistent button
> element that swaps role (testids `play`/`pause` preserved verbatim), native
> pointer listeners via ref callback, and a consumed-press flag that swallows
> the trailing ghost click. Reducer changes (Step 3) and e2e changes
> (Steps 1, 7) shipped as planned. e2e totals: 7 existing + 1 new = 8 (the
> "9" below miscounted). See the spec's `PlayPauseButton` section for the
> authoritative mechanics.

**Hard constraints:**
- All existing e2e `data-testid`s preserved verbatim (`play`, `pause`, etc.).
- `src/core/**` untouched.
- No emoji.
- Continuous-playback behavior identical to today (dwell timing, stage pauses, auto-continue).

**Verification commands:**
- Unit: `npm test` (69 tests, unchanged by this feature)
- Lint: `npm run lint` | Build: `npm run build`
- e2e: `npm run e2e` (currently 8 pass → 9 after this plan)
- One e2e test: `npx playwright test -g "<title fragment>"`

---

## Current-code primer (read first)

- `src/App.tsx` holds a `useReducer` state machine. `PLAY` (line ~123) sets `phase: 'PLAYING'` when a solution exists and `moveIndex < moves.length`. `PLAY_TURN_DONE` (line ~129) commits the finished move's snapshot and decides what happens next: end → SOLVED; stage boundary without auto-continue → PAUSED; action-group boundary → dwell; otherwise keep playing.
- A tap always starts from PAUSED, where `isDwelling` is `false` (PAUSE and SEEK both reset it), so the tapped move animates immediately — no dwell happens in single mode, and none should.
- The global Space handler (line ~207) ignores events targeting BUTTON/INPUT/SELECT/TEXTAREA and dispatches PLAY/PAUSE.
- `src/view/ControlPanel.tsx` renders the play button (`data-testid="play"`, shown when `phase !== 'PLAYING'`) and the pause button (`data-testid="pause"`, shown when PLAYING). They are different elements that swap on phase change.
- `e2e/journey.spec.ts` has 8 tests; 3 of them click `play` expecting continuous playback (4 click sites: lines 15, 31, 37, 47).
- Browser fact used by the hook: keyboard activation of a focused button (Enter/Space) fires a `click` event with `detail === 0`; pointer clicks have `detail >= 1`.
- Playwright fact: the play button unmounts at the 600 ms mark mid-hold (swaps to pause), so holds use raw `mouse.down()`/`mouse.up()` instead of `click({ delay })` to avoid element-detachment flakiness.

---

## Task 1: Tap plays one move, hold starts continuous playback

**Depends on:** none

**Files:**
- Create: `src/view/use-press-hold.ts`
- Modify: `src/App.tsx` (PlayMode type, PLAY payload, playMode state, PLAY_TURN_DONE, Space handler, onPlayOne callback, ControlPanel prop)
- Modify: `src/view/ControlPanel.tsx` (onPlayOne prop, usePressHold on the play button)
- Test: `e2e/journey.spec.ts` (1 new test, 4 click sites switched to holds)

- [ ] **Step 1: Append the failing e2e test**

Append to `e2e/journey.spec.ts`:

```ts
test('tapping play advances exactly one move then pauses', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();
  await expect(page.getByTestId('scrub')).toHaveValue('0');

  // Quick tap: press is well under the 600 ms hold threshold.
  await page.getByTestId('play').click();
  // Assert the move committed BEFORE asserting PAUSED — PAUSED is also the
  // pre-tap state, so checking it first would race the turn animation.
  await expect(page.getByTestId('scrub')).toHaveValue('1', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-phase', 'PAUSED');

  // A second tap advances exactly one more move.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('scrub')).toHaveValue('2', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-phase', 'PAUSED');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test -g "tapping play advances"`
Expected: FAIL — today a click starts continuous playback, so the scrub value
runs past 1 (or the PAUSED assertion fails while PLAYING).

- [ ] **Step 3: Reducer + wiring in `src/App.tsx`**

Add the mode type next to `Phase` (line ~26):

```ts
type PlayMode = 'continuous' | 'single';
```

Extend `AppState` — add after `autoContinue`:

```ts
  playMode: PlayMode; // single = pause again after the next completed move
```

Change the `PLAY` member of the `Action` union:

```ts
  | { type: 'PLAY'; mode: PlayMode }
```

Update the `PLAY` case:

```ts
    case 'PLAY':
      return s.solution && s.moveIndex < s.solution.moves.length
        ? { ...s, phase: 'PLAYING', playMode: a.mode }
        : s;
```

In `PLAY_TURN_DONE`, insert the single-mode early return between the
end-of-solve check and the stage-boundary check:

```ts
    case 'PLAY_TURN_DONE': {
      if (!s.solution) return s;
      const next = s.moveIndex + 1;
      const cube = s.solution.snapshots[next];
      if (next >= s.solution.moves.length) {
        return { ...s, cube, moveIndex: next, phase: 'SOLVED' };
      }
      // Single-step play: stop after the one move completes.
      if (s.playMode === 'single') {
        return { ...s, cube, moveIndex: next, phase: 'PAUSED', isDwelling: false };
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

Add to `INITIAL_STATE` after `autoContinue: false,`:

```ts
  playMode: 'continuous',
```

Update the callbacks (line ~191):

```ts
  const onPlay = useCallback(() => dispatch({ type: 'PLAY', mode: 'continuous' }), []);
  const onPlayOne = useCallback(() => dispatch({ type: 'PLAY', mode: 'single' }), []);
```

Update the Space branch of the keyboard handler (line ~207):

```ts
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (s.phase === 'PLAYING') dispatch({ type: 'PAUSE' });
        else dispatch({ type: 'PLAY', mode: 'continuous' });
      }
```

Pass the new prop to ControlPanel (after `onPlay={onPlay}`):

```tsx
          onPlayOne={onPlayOne}
```

- [ ] **Step 4: Create `src/view/use-press-hold.ts`**

```ts
import { useCallback, useEffect, useRef, type MouseEvent } from 'react';

export interface PressHoldProps {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onClick: (ev: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Tap-vs-hold press detection for a button.
 *
 * - Press released before `thresholdMs`: `onTap` fires on release.
 * - Press reaching `thresholdMs`: `onHold` fires at the threshold while still
 *   held; the release is then a no-op.
 * - Pointer leaving or cancelling before the threshold aborts the press.
 * - Keyboard activation (a click with `detail === 0`, i.e. Enter/Space on the
 *   focused button) counts as a tap; pointer clicks (`detail >= 1`) are
 *   ignored because the tap already fired on pointerup.
 */
export function usePressHold(
  onTap: () => void,
  onHold: () => void,
  thresholdMs: number,
): PressHoldProps {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // The component may unmount mid-press (the play button swaps to the pause
  // button when the hold fires) — drop any pending timer.
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      onHold();
    }, thresholdMs);
  }, [clear, onHold, thresholdMs]);

  const onPointerUp = useCallback(() => {
    if (timer.current !== null) {
      clear();
      onTap();
    }
  }, [clear, onTap]);

  const onClick = useCallback(
    (ev: MouseEvent<HTMLButtonElement>) => {
      if (ev.detail === 0) onTap();
    },
    [onTap],
  );

  return { onPointerDown, onPointerUp, onPointerLeave: clear, onPointerCancel: clear, onClick };
}
```

- [ ] **Step 5: Wire the hook in `src/view/ControlPanel.tsx`**

Add the import and constant at the top (next to the existing imports):

```ts
import { usePressHold } from './use-press-hold';

const HOLD_TO_PLAY_MS = 600; // press this long to start continuous playback
```

Add the prop to `ControlPanelProps` after `onPlay`:

```ts
  onPlayOne: () => void;
```

Call the hook at the top of the component body (unconditionally — rules of
hooks; it is inert while the pause button is shown):

```ts
export function ControlPanel(p: ControlPanelProps) {
  const haveSolution = p.stages !== null && p.totalMoves > 0;
  const curStage = haveSolution ? stageIndexAt(p.stageStart, p.moveIndex) : -1;
  const atEnd = p.moveIndex >= p.totalMoves;
  const playPress = usePressHold(p.onPlayOne, p.onPlay, HOLD_TO_PLAY_MS);
```

Replace the play button's `onClick={p.onPlay}` with the spread handlers — the
button becomes:

```tsx
            <button
              data-testid="play"
              className="btn btn-circle btn-primary btn-lg"
              aria-label="Play"
              disabled={!haveSolution || atEnd}
              {...playPress}
            >
              <HugeiconsIcon icon={PlayIcon} size={26} strokeWidth={2} aria-hidden />
            </button>
```

The pause button is untouched (plain `onClick={p.onPause}`).

- [ ] **Step 6: Run the new e2e test to verify it passes**

Run: `npx playwright test -g "tapping play advances"`
Expected: PASS.

- [ ] **Step 7: Switch the 4 existing play-click sites to holds**

In `e2e/journey.spec.ts`, extend the import and add the helper below it:

```ts
import { expect, test, type Page } from '@playwright/test';

/** Press-and-hold the play button past the 600 ms threshold → continuous playback. */
async function holdPlay(page: Page): Promise<void> {
  await page.getByTestId('play').hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}
```

Replace each of the 4 `await page.getByTestId('play').click();` lines in the
3 continuous-playback tests (lines 15, 31, 37, 47 — tests "play to
completion", "pauses at each stage boundary" twice, "hard-resets
mid-playback") with:

```ts
  await holdPlay(page);
```

Raw `mouse.down/up` is used instead of `click({ delay: 700 })` because the
play button unmounts at the 600 ms mark (swaps to the pause button), which a
locator click may treat as element detachment. The `data-phase` 'PLAYING'
assertions that follow each site still hold — the phase flips during the hold.

- [ ] **Step 8: Full e2e run**

Run: `npm run e2e`
Expected: 9/9 pass.

- [ ] **Step 9: Unit + lint + build**

Run: `npm test && npm run lint && npm run build`
Expected: 69 unit tests pass (unchanged), lint and build clean.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/view/ControlPanel.tsx src/view/use-press-hold.ts e2e/journey.spec.ts
git commit -m "feat: play button taps one move, hold starts continuous playback"
```

---

## Final verification (whole feature)

1. `npm test` — 69 unit tests green.
2. `npm run lint && npm run build` — clean.
3. `npm run e2e` — 9/9 green; all pre-existing `data-testid`s untouched.
4. Manual (http://localhost:5173): scramble → solve → tap play repeatedly
   (one animated move per tap, pauses each time, caption/highlight update);
   press-and-hold play (~1 s) → continuous playback starts at the 600 ms mark
   while still held, release does nothing; click pause mid-playback → pauses
   at that step; Space still toggles play/pause; Tab to the play button and
   press Enter → single move.
