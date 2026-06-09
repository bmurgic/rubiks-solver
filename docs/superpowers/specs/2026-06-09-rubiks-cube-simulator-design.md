# Rubik's Cube Simulator — Design

**Date:** 2026-06-09
**Status:** Approved pending user review
**Governing docs:** `CONTEXT.md` (glossary, canonical), ADR 0001 (hand-rolled solver), ADR 0002 (tutorial fidelity), PRD ([issue #1](https://github.com/bmurgic/rubiks-solver/issues/1))

## Overview

A browser-based 3x3 Rubik's Cube solver and visualizer for beginners of any age. One click scrambles the cube with an animated random scramble; a second click computes a beginner-method (layer-by-layer) solution and plays it back as a staged, step-through 3D animation with media-player-style controls.

Stack: Vite + React + TypeScript. react-three-fiber renders the cube; React renders the control panel.

## Architecture

Two layers with a hard boundary:

- **core** (`src/core/`) — pure TypeScript. Zero three.js or React imports, enforced by an eslint `no-restricted-imports` rule. Fully testable headless.
- **view** (`src/view/`) — react-three-fiber cube and React control panel. Consumes core through its public interfaces only.

The core stays a folder inside the single Vite app. Package extraction is deferred until someone outside this app needs it (YAGNI); the import boundary keeps extraction mechanical.

## Core modules

### cube-model

The engine. Exposes:

- `CubeState` — immutable: corner permutation (8), corner orientation (twist 0/1/2), edge permutation (12), edge orientation (flip 0/1). Kociemba-standard slot indexing and orientation rules (see CONTEXT.md). Centers are fixed and implicit.
- `solved(): CubeState`
- `apply(state, move): CubeState` — pure; returns a new state.

Internals: only the 6 clockwise quarter-turn tables (U, D, L, R, F, B) are hand-written, transcribed from the published Kociemba reference tables. The prime and double variants are derived by composition at module load, giving all 18 Moves. A typo in a base table is caught by the foundation tests (below); the derived 12 are correct by construction.

### notation

- `parse(str): Move[]` — parses standard face-turn notation (`"R U R' U'"`).
- `format(moves): string`

Algorithms throughout the solver are defined as readable notation strings parsed once at module load. Parse failures on these constants throw at load (programmer error). Parsing of any future user-supplied input must validate and report errors; no user-supplied notation exists in v1.

### scramble

- `scramble(rng): Move[]` — ~25 WCA-style random face turns (no consecutive same-face moves, no trivially cancelling pairs). Takes a seedable RNG so tests are reproducible and a future URL-seed feature stays cheap. Always solvable by construction (only legal Moves applied to solved).

### validate

- `assertSolvable(state): void` — throws `UnsolvableCubeError` (typed, names the violated invariant) when any of these fail:
  1. structural integrity — each cubie appears exactly once,
  2. corner twist sum ≡ 0 (mod 3),
  3. edge flip sum ≡ 0 (mod 2),
  4. corner permutation parity = edge permutation parity.

### facelets

- `toFacelets(state): Facelet[54]` — derives sticker colors from Cube State. Used by the view for rendering and by tests for human-readable assertions. Never a source of truth.

### solver

- `solve(state): Stage[]` — the single public entry point, behind a swappable interface.

Pipeline: `assertSolvable` first, then six sequential stage solvers, each consuming the state the previous stage produced:

1. **Daisy** — 4 white edges placed around the yellow center on Up, case-by-case as tutorials teach it.
2. **Cross** — each daisy edge aligned with its center and turned down.
3. **First Layer** — each white corner brought above its slot, inserted with repeated righty-alg (`R U R' U'`) trials; corners in a wrong/twisted Down slot are ejected first with the same alg.
4. **Second Layer** — each middle edge solved with the standard left/right insert algorithms; wrongly-placed edges ejected by inserting a U-layer edge into their slot.
5. **OLL (2-look)** — orient last-layer edges (`F R U R' U' F'` from dot/L/line cases), then corners (Sune repetitions by case).
6. **PLL (2-look)** — permute corners (headlights recognition, standard alg), then edges (U-perm cases), finish with final U-face alignment (AUF).

Per ADR 0002, every stage mimics popular beginner tutorials even where search would be shorter. Expected total ~120–160 moves.

Recognition reads the cubie model directly (which cubie is in which slot, at what orientation) — no facelet round-trip.

Each stage solver:
- emits raw moves, then a within-stage cleanup pass merges/cancels adjacent same-face moves (`R R'` → drop, `U U` → `U2`). Never merges across stage boundaries — stage jump targets and invariants stay exact.
- has a move cap; exceeding it throws (fail loud, never hang). Caps are generous multiples of worst-case tutorial counts.

Empty stages (e.g. cross already solved by luck) are emitted with zero moves so the stage list is always the same six entries — playback UI stays uniform.

### playback

Pure state machine + snapshot store, no rendering knowledge:

- App states: `SOLVED → SCRAMBLING → SCRAMBLED → PLAYING ⇄ PAUSED → SOLVED`.
- At solve time, precompute `states[i]`: one immutable Cube State per move index (snapshot array). Logical seek = array index.
- Step forward = play move `i`; step backward = play the inverse of move `i-1` visually, land on `states[i-1]`.
- Scrub: cancel any in-flight turn, snap to `states[target]`, resume from there.
- Stage jump = seek to the stage's first move index.
- `Scramble` is always available and hard-resets: cancel in-flight animation, discard Solution, snap to solved, generate and animate a new scramble.

## View layer

### cube-view (r3f)

**Static meshes + recolor.** 26 cubie meshes (8 corners, 12 edges, 6 centers — no hidden core) sit permanently at fixed grid positions; sticker colors are derived from `toFacelets(state)` on every state change. Mesh = location, not physical cubie.

Turn animation: the 9 meshes of the turning face (4 corners, 4 edges, 1 center) — a constant per-face lookup, since meshes never move — are parented to a temporary pivot group, rotated 90° (or 180° for double moves) over the animation duration via `useFrame`, then rotation is reset to zero and the new state's colors applied in the same frame. Rotated-old-colors and reset-new-colors are pixel-identical, so the handoff is seamless.

Why: scrubbing is instant and glitch-free (snap = recolor from snapshot — beginners will yank the slider), zero transform accumulation or float drift, fully declarative state→render.

### Camera

drei OrbitControls, constrained for beginners:
- rotate only — **pan disabled** (panning is how beginners lose the cube off-center),
- zoom clamped to min/max distance,
- damping enabled,
- full polar rotation allowed (must be able to peek at the bottom face),
- **Reset View** button + double-click snaps to the classic three-quarter view (Up + Front + Right visible),
- camera never moves on its own during playback.

### control-panel (React)

Media-player metaphor — the one control pattern every age knows:

- Cube fills the screen; one control bar at the bottom.
- Two big primary buttons: **Scramble** and **Solve**, icon + text label.
- Playback row: jump-to-previous-stage ⏮, step-back ◀, large Play/Pause, step-forward ▶, jump-to-next-stage ⏭.
- Scrub slider as a **segmented timeline** — one colored segment per stage; clicking a segment jumps to that stage.
- Current stage name displayed large above the bar; current move notation shown big beside it.
- Speed: preset select 0.5× / 1× / 2×.
- Every control's enabled/disabled state derives from the playback state machine — no clickable-but-dead buttons.

### Convention (hardcoded, v1)

Standard Western color scheme, white on Down / yellow on Up, classic three-quarter starting camera. Not user-customizable.

## Data flow

```
[Scramble click] → scramble(rng) → Move[] → animate each via cube-view,
                   apply() per completed turn → SCRAMBLED state

[Solve click]    → solve(state) → Stage[] → flatten to Move[] + stage index map
                 → precompute states[] snapshots → PLAYING

[Playback tick]  → cube-view animates move i → on completion, state = states[i+1]
[Scrub/jump]     → cancel in-flight → state = states[target] (recolor) → resume
```

React state holds: app-flow state, current Cube State, Solution, current move index, speed. Core functions are all pure; the view owns all mutability.

## Error handling

- `solve()` throws `UnsolvableCubeError` on invalid input — impossible in-app (states only come from legal moves) but guards the library boundary and future manual-input features.
- Stage move caps throw a typed error naming the stage — converts solver recognition bugs into loud test failures instead of hangs.
- Notation constants parse at module load — a typo in an algorithm string fails the first test run, not mid-solve.
- The view layer renders only states the core produced; there is no user input to validate in v1 beyond button clicks gated by the state machine.

## Testing

Vitest, AAA pattern, behavioral test names. Tests assert external behavior through public interfaces — never table internals.

| Suite | What it proves |
|---|---|
| Foundation | every Move applied 4× = identity (2× for doubles); `(R U R' U')×6` = identity; scramble + inverse = solved |
| Validation | each invariant violation throws the right `UnsolvableCubeError`; solved and scrambled states pass |
| Notation | parse/format round-trip; rejects malformed strings |
| Facelets | solved state derives the canonical color layout; spot-check known positions after fixed move sequences |
| Per-stage | after each stage its sub-goal invariant holds AND prior stages remain intact, across many random scrambles |
| **Correctness gate** | ~10,000 seeded random scrambles: solve each, assert final state is solved; no stage cap ever hit |
| Cleanup property | cleaned move sequence reaches the same state as the raw sequence |
| Playback | state machine transitions; snapshot array consistency (`states[i+1] = apply(states[i], move[i])`) |
| E2E (Playwright) | one journey: load → Scramble → Solve → play to completion → cube visually solved |

View layer gets no component tests in v1; the e2e journey covers integration.

## Out of scope (v1)

Slice/wide/rotation moves, manual state entry, other solving methods, color/camera customization, non-3x3 cubes, timers/stats, persistence, npm publishing, annotated-chunk teaching captions (deferred — see PRD issue #1 comment).

## Build order (suggested for planning)

1. cube-model + notation + foundation tests
2. scramble + validate + facelets
3. solver stages in order (Daisy → … → PLL), each with its per-stage tests, then the 10k gate
4. playback state machine + snapshots
5. cube-view (static meshes, recolor, pivot animation)
6. control-panel + camera
7. e2e journey
