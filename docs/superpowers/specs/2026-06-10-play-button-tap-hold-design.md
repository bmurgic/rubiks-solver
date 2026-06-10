# Play Button Tap vs Hold — Design

**Date:** 2026-06-10
**Branch:** `feat/teach-the-solve`
**Origin:** "Make it so clicking the play button just does one singular move, but
holding it down for 3s+ will make it toggle then clicking again will pause it at
that step."

## Problem

The play button only starts continuous playback. Learners stepping through a
solve one move at a time must use the separate step-forward button, which snaps
the cube instantly with no turn animation, dwell, or caption — losing the
teaching value of watching the move happen.

## Decisions (user-confirmed)

1. **Tap** (press shorter than the hold threshold): play exactly **one move**
   with the full turn animation, dwell, and "Now:" caption, then pause.
2. **Hold threshold: 600 ms** (revised down from the original 3 s during
   design review — standard long-press feel).
3. **Hold fires at the threshold while still held**: continuous playback starts
   the moment 600 ms elapses; releasing after that does nothing.
4. **Click while playing pauses at the current step** — the existing pause
   button behavior, unchanged.
5. **Space key keeps its current play/pause toggle.** Hold semantics are
   pointer-only. Keyboard focus-activation of the play button (Enter/Space on
   the focused button) counts as a tap → single move.

## Behavior

| Interaction | Result |
|---|---|
| Tap play (<600 ms press) | One move plays with animation + dwell + caption; phase → PAUSED at `moveIndex + 1` |
| Press play, hold ≥600 ms | Continuous playback starts at the 600 ms mark; release is a no-op |
| Click pause (while PLAYING) | Pause at the current step (unchanged) |
| Space (global) | Toggle play/pause (unchanged; play side starts continuous playback) |
| Tap at end of solve | Button disabled (unchanged) |
| Pointer leaves / cancels before 600 ms | Press aborted: no move, no playback |

A tap during single-move playback hits the pause button (phase is PLAYING, so
the pause button is shown) and pauses mid-move per existing pause semantics.

## Architecture

Two small units:

```
ControlPanel: usePressHold(onTap, onHold, 600) ──> play button pointer events
App reducer:  PLAY { mode: 'continuous' | 'single' } ──> playMode in state
              PLAY_TURN_DONE + playMode 'single' ──> PAUSED
```

### Reducer (`src/App.tsx`)

- `PLAY` action gains a `mode: 'continuous' | 'single'` payload.
- State gains `playMode: 'continuous' | 'single'`, set on `PLAY`.
- `PLAY_TURN_DONE`: when `playMode === 'single'`, transition to PAUSED after
  the completed move commits — stage-boundary pause and auto-continue logic are
  skipped (we pause regardless, so they are moot for that move).
- All other actions (PAUSE, SEEK, SCRAMBLE, SPEED, TOGGLE_AUTO) unchanged.
  Space-key dispatch and the pause button dispatch plain `PAUSE` as today;
  Space's play side dispatches `PLAY` with `mode: 'continuous'`.
- Dwell still runs before the move when the tap lands on an action-group
  boundary — the caption explains the move that is about to play.

### Press-hold hook (`src/view/use-press-hold.ts`, new)

`usePressHold(onTap, onHold, thresholdMs)` returns props to spread on the
button:

- `onPointerDown`: start a `setTimeout(thresholdMs)`; capture the pointer.
- Timer fires → call `onHold` (press consumed; subsequent release ignored).
- `onPointerUp` before the timer → clear timer, call `onTap`.
- `onPointerCancel` / `onPointerLeave` before the timer → clear timer, no call.
- `onKeyDown` Enter/Space (button focus activation) → `onTap` (suppress the
  synthetic click so a tap never double-fires).
- Cleanup on unmount clears any pending timer.

The play button stops using `onClick` and spreads the hook's handlers.
`onTap` dispatches `PLAY { mode: 'single' }`; `onHold` dispatches
`PLAY { mode: 'continuous' }`.

### No visual hold-progress indicator

Phase flips to PLAYING at the 600 ms mark (pause button swaps in) — that is the
feedback. A progress ring was considered and rejected (YAGNI).

## Hard constraints

- All existing e2e `data-testid`s preserved verbatim (`play`, `pause`, etc.).
- `src/core/**` untouched.
- No emoji.
- Turn animation, dwell timing, stage-boundary pause, and auto-continue
  behavior unchanged for continuous playback.

## Testing

- **e2e (`e2e/journey.spec.ts`):** the 3 existing tests that click `play`
  expecting continuous playback switch to `click({ delay: 700 })` — Playwright
  holds the mouse down for the delay, crossing the 600 ms threshold. Assertions
  unchanged. One new test: tap play → exactly one move advances
  (`current-move`/counter changes by one) → phase returns to PAUSED.
- **Unit:** none added — the reducer lives inside `App.tsx` (not separately
  unit-tested today) and the hook is timer + pointer glue; behavior is covered
  end-to-end. If the reducer is ever extracted, single-mode transitions should
  get unit coverage then.

## Out of scope

- Hold-to-fast-forward or hold-repeat stepping.
- Visual hold-progress indicator on the button.
- Changing step-forward/step-back buttons (they keep instant snap).
- Touch-specific long-press menus (pointer events already cover touch).
