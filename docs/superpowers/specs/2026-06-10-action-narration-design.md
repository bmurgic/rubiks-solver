# Action Narration & Paced Playback — Design

**Date:** 2026-06-10
**Status:** Approved direction (dwell pacing + full build chosen by user)

## Problem

The teaching panel explains stages, but within a stage the solve "breezes
past" moves with no indication of *why* any move happens. Users can't connect
the animation to the method: which piece is being worked, what tactic is in
play, when one action ends and the next begins.

## Goal

1. **Per-action "why"**: every move belongs to a named action ("Spin the top
   until the corner sits over its home slot", "Run the righty trigger") shown
   live during playback.
2. **Action-paced playback**: a short dwell (~0.8 s, scaled by speed) at each
   action boundary so moves arrive in meaningful chunks while the caption
   updates. Existing stage pauses + Auto checkbox unchanged.

Granularity is the **action/trigger**, not the individual turn — algorithms
are memorized units; explaining each turn of `R U R' U'` separately is not
how the method is taught (matches the original brainstorm choice).

## Architecture

### 1. Core: Emitter action brackets (`src/core/solver/**`)

`Emitter` gains an explicit action bracket; every emission must happen inside
one:

```ts
export interface ActionGroup {
  readonly why: string;
  readonly moves: readonly Move[]; // cleaned, never empty
}

class Emitter {
  action(why: string, fn: () => void): void; // throws on nesting
  do(seq): void;                             // throws if no active action
  toStage(): Stage;                          // builds groups + flattened moves
}
```

- `action()` records the start index, runs `fn`, then runs `cleanup()` on
  **that slice only** and pushes a group if any moves survive (fully-cancelled
  actions are dropped).
- `Stage` gains `groups: readonly ActionGroup[]`; `moves` stays and is the
  concatenation of group moves (existing consumers unaffected).
- `cleanup()` moves from per-stage to per-action. Cross-action merges no
  longer happen — costs a couple of moves per solve, keeps each narrated
  action intact (better pedagogy, simpler indices).
- `rotateUUntil` is always called inside an enclosing `action()`.
- All 6 stage files annotate their emission sites with real beginner copy,
  bracketed at tactic level (e.g. Daisy: separate whys for "drop a flipped
  petal out through its side" vs "double-turn a white-down edge up into the
  daisy" vs "lift a middle-layer edge up"). Repeated identical captions
  (trigger retries) are intentional — repetition is part of the method.

### 2. App wiring (`src/App.tsx`)

- `buildSolution` flattens groups: `groupStart: number[]`, `groupWhy:
  string[]` (same pattern as `stageStart`).
- New state `isDwelling: boolean` + actions `DWELL_DONE`. In
  `PLAY_TURN_DONE`, when the next move index lands on a `groupStart` (and is
  not the end, and not a stage-boundary pause), stay `PLAYING` but set
  `isDwelling: true`.
- While `isDwelling`, no turn is scheduled; an effect runs
  `setTimeout(DWELL_MS / speed)` → `DWELL_DONE` clears the flag and playback
  resumes. `PAUSE`/`SEEK`/`SCRAMBLE` clear the flag. `data-phase` stays
  `PLAYING` during dwell (no new phase; existing e2e unaffected).
- Stage-boundary pause (existing) wins over dwell at coinciding boundaries.
  With Auto on, stage starts are also group starts, so Auto playback gets a
  dwell breath at stage changes naturally.
- Current action caption: `groupWhy[stageIndexAt(groupStart, moveIndex)]`
  (reuses the generic last-start-≤-index helper).

### 3. View (`src/view/TeachingPanel.tsx`)

- New prop `actionWhy: string | null`. When non-null (solution exists and
  playback is mid-solve), both the mobile card and the desktop rail detail
  area show a "Now" line: the current action's why, above the stage
  goal/why. `data-testid="action-why"` (one element per visible variant —
  same single-visible pattern as the card/rail split).
- No ControlPanel changes.

## Hard constraints

- `src/core/**` stays free of react/three imports (boundary unchanged —
  narration strings are plain data).
- Every existing `data-testid` preserved; only `action-why` added.
- No emoji. Solver must still solve: all existing unit + gate tests green.

## Testing

- **Unit (emitter):** action grouping, per-action cleanup, empty-group
  dropping, throw on `do()` outside action / nested `action()`.
- **Gate (solve):** for seeded scrambles, every stage's `groups` all have
  non-empty `why`, and `groups.flatMap(g => g.moves)` equals `stage.moves`.
- **E2E:** after Solve, `action-why` visible and non-empty; seeking to a
  different stage changes... (text compare avoided — assert non-empty +
  presence only, deterministic).
- Existing play-to-completion journey absorbs dwell time (~+10-15 s at 2×;
  within the 120 s timeout).

## Out of scope

- Per-individual-turn explanations (see grain rationale above).
- Affected-piece highlighting on the 3D cube (still a follow-up).
- Notation legend (still a follow-up).
