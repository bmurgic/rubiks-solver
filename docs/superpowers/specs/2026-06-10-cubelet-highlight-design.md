# Cubelet Highlight & Layer Cue — Design

**Date:** 2026-06-10
**Branch:** `feat/teach-the-solve`
**Origin:** "We need to highlight which one is supposed to rotated and highlight the
cubelet, cubelets if more than one referenced, that it is referencing."

## Problem

Action narration (the "Now:" caption) tells the learner *why* a move happens, but
nothing on the cube shows *which piece* the caption is talking about, and nothing
signals *which layer* is about to rotate before it starts moving. The learner has
to guess which of 26 cubelets the sentence refers to.

## Decisions (user-confirmed)

1. **Show both**: highlight the action's target piece(s) AND cue the turning layer.
2. **Piece visual**: pulsing emissive glow on the target cubelet (body + stickers).
3. **Layer cue timing**: tint the upcoming move's layer during the dwell, and keep
   the rotating layer tinted while a move animates. No new pauses added.

## Architecture

Targets originate in the solver (it alone knows which cubie an action is about),
flow through `ActionGroup` as pure data, and are resolved to 3D grid positions in
the view layer using the live `CubeState`. The highlight re-resolves after every
move, so it follows the piece as it travels around the cube.

```
stage code ── PieceRef[] per action ──> ActionGroup.targets
                                              │
App: current group + s.cube ── resolve cubie → slot → grid pos ──> CubeView
App: dwell/turn state ──────── cueFace: Face | null ─────────────> CubeView
```

`src/core/**` stays free of three/react imports — `PieceRef` is plain data.

## Core changes (`src/core/solver/`)

### `types.ts`

```ts
export interface PieceRef {
  readonly kind: 'edge' | 'corner';
  readonly piece: number; // cubie id: Edge.* (0–11) or Corner.* (0–7)
}

export interface ActionGroup {
  readonly why: string;
  readonly targets: readonly PieceRef[]; // pieces the narration references; may be empty
  readonly moves: readonly Move[];
}
```

### `emitter.ts`

`action(why, fn)` becomes `action(why: string, targets: readonly PieceRef[], fn: () => void)`.
Targets are stored on the group at close. All existing semantics unchanged:
per-action cleanup, dropped-when-empty, nested/outside-action throws, cap counting.

### Stages (all six)

Every `e.action(...)` call gains a targets argument — the cubie id(s) the
narration sentence is about, identified by **piece identity** (cubie id), never
by slot:

- **Daisy / Cross:** the white edge cubie currently being placed.
- **First layer:** the white corner cubie being inserted.
- **Second layer:** the middle-layer edge cubie being inserted.
- **OLL / PLL:** the last-layer piece(s) the step inspects or repositions.
- **Setup-only actions** (e.g. "spin the top to look around") that reference no
  specific piece pass `[]` — nothing highlights.

Where a helper currently receives a slot, derive the cubie via
`e.state.ep[slot]` / `e.state.cp[slot]` at the action call site (the state
*before* the action's first move).

### Gate test

`solve.gate.test.ts` group invariants extend to targets across 10k scrambles:
`kind === 'edge'` → `0 <= piece <= 11`; `kind === 'corner'` → `0 <= piece <= 7`.

## View mapping (`src/view/piece-positions.ts`, new)

Pure, unit-tested module:

- `EDGE_SLOT_POS: readonly Vec3[]` — edge slot index → grid position
  (e.g. `UF → [0, 1, 1]`, `FR → [1, 0, 1]`), all 12 slots.
- `CORNER_SLOT_POS: readonly Vec3[]` — corner slot index → grid position
  (e.g. `URF → [1, 1, 1]`), all 8 slots.
- `targetPositions(state: CubeState, targets: readonly PieceRef[]): Vec3[]` —
  for each ref, find the slot whose `state.ep`/`state.cp` entry equals
  `ref.piece`, return that slot's grid position.

Imports core types only (allowed direction: view → core).

## App changes (`src/App.tsx`)

- `buildSolution` adds `groupTargets: readonly (readonly PieceRef[])[]`,
  parallel to the existing `groupWhy` (same accumulation loop).
- Derived per render, same guard as `actionWhy` (solution exists and
  `moveIndex < moves.length`):
  - `highlightPositions: Vec3[]` =
    `targetPositions(s.cube, groupTargets[stageIndexAt(groupStart, moveIndex)])`.
  - `cueFace: Face | null` = while a turn animates → that move's face;
    while dwelling (or paused/stepping with a next move pending) → the upcoming
    move's face; otherwise `null`.
- Both passed to `CubeView`. Outside a solve (SOLVED, SCRAMBLED, scrambling)
  both are empty/null. Seek and manual step need no special handling — `s.cube`
  snapshots already reflect `moveIndex`.

## CubeView changes (`src/view/CubeView.tsx`)

- `CubeViewProps` gains `highlightPositions: readonly Vec3[]` and
  `cueFace: Face | null`.
- `Cubelet` gains `highlight: boolean` and `tinted: boolean`.
  Memoization stays effective: props change only on state commits.
- **Highlight (pulse):** target cubelet gets a translucent glow shell — a
  slightly larger rounded box in the accent orange (`#EA580C`) whose opacity
  breathes on a ~1s cycle driven by `useFrame`. Sticker colors stay visible
  through it. With `prefers-reduced-motion: reduce` (checked via
  `matchMedia`), opacity is static — glow without pulse.
- **Tint (layer cue):** the 9 cubelets selected by `FACE_SELECTOR[cueFace]`
  get a constant, faint indigo (`#4F46E5`) shell — clearly weaker than the
  pulse so the two read as different signals. A highlighted cubelet inside
  the cued layer shows the pulse (pulse wins).
- During a turn the highlighted piece sits in the `TurningGroup`, so the glow
  rotates with the layer automatically. On `TURN_DONE` the new state commits
  and the highlight re-resolves to the piece's new slot.

## Observability for e2e

WebGL pixels are untestable in Playwright; expose state on the app root instead:

- `data-cue-face` on the `app` div: the cued face letter; the attribute is
  omitted entirely when no cue is active.

e2e: after Solve + seek to start, `data-cue-face` matches the first move's face.
Highlight correctness is covered by `targetPositions` unit tests + the gate
invariants, not by pixel assertions.

## Testing summary

- **Unit:** slot→position tables complete and distinct; `targetPositions`
  resolves moved pieces correctly after applying moves; emitter stores targets;
  reducer-level `cueFace` derivation if extracted as a helper.
- **Gate:** target validity invariants over 10k seeded scrambles.
- **e2e:** one scenario asserting `data-cue-face` during a paused solve.
  All existing `data-testid`s preserved verbatim.

## Out of scope

- Arrows or move-notation overlays on the cube.
- Highlighting destination slots (where the piece is headed).
- Per-move pre-pauses (rejected: slows playback).
