# Rubik's Cube Simulator

A browser-based 3x3 Rubik's Cube solver and visualizer. Generates a random scramble, then plays back a beginner-method (layer-by-layer) solution as a staged, step-through 3D animation.

## Language

**Cubie**:
A single physical piece of the cube. 8 corners, 12 edges, 6 fixed centers. The internal model tracks the 8 corners and 12 edges only.
_Avoid_: cube, block, piece, voxel

**Slot**:
A fixed position a cubie can occupy, identified by index (8 corner slots, 12 edge slots). Distinct from the cubie currently in it. Indexing follows the Kociemba-standard convention — corners URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB (0–7); edges UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR (0–11).
_Avoid_: position, location, cell

**Permutation**:
The mapping of which cubie sits in which slot. Part of cube state.

**Orientation**:
How a cubie is twisted within its slot, per the Kociemba-standard convention. Corners: 0/1/2 twist of the U/D facelet (0 = U/D color on the U/D face). Edges: 0/1 flip per the Kociemba flip rule. Part of cube state.

**Cube State**:
The complete logical state: permutation + orientation for corners and edges. Immutable; moves produce new state. Source of truth.
_Avoid_: board, grid

**Facelet**:
One of 54 colored stickers (6 faces × 9). Derived from Cube State for rendering only — never the source of truth.
_Avoid_: sticker (use facelet), tile

**Move**:
A face turn in standard notation: one of 18 — {U,D,L,R,F,B} × {quarter CW, quarter CCW (`'`), half (`2`)}. A pure function `apply(state, move) → state`. Slice and whole-cube moves are explicitly out of scope for v1.

**Scramble**:
A random sequence of ~25 **Moves** applied to the solved state to produce the starting **Cube State**. Always solvable by construction.

**Mesh**:
The 3D box rendered for a cubie in the view layer. A fixed `slot → mesh` mapping links the logical model to the render grid.

**Stage**:
One named phase of the layer-by-layer solution holding an ordered list of **Moves**. The canonical sequence: **Daisy**, Cross, First Layer, Second Layer, OLL, PLL. Used as a label and jump target; not the atomic step unit.
_Avoid_: phase, step (a step is one Move)

**Daisy**:
The first **Stage**: the 4 white edges placed around the yellow center on the Up face (white facelets up), staged for turning down into the Cross. Solved case-by-case to match how beginner tutorials teach it.

**Solution**:
The ordered list of **Stages** the solver returns for a given **Cube State**. Playback advances one **Move** at a time; **Stage** is a label/jump layer on top.

**Convention**:
Fixed reference the solver assumes — standard Western color scheme (white↔yellow, green↔blue, red↔orange) with **white on Down, yellow on Up**. Colors and orientation are hardcoded for v1. Centers are fixed, so this holds automatically under the 18-move set.

## Relationships

- A **Cube State** assigns each **Slot** one **Cubie** (**Permutation**) plus an **Orientation**
- A **Move** transforms one **Cube State** into a new **Cube State** (immutable)
- **Facelets** are derived from **Cube State**; the view renders one **Mesh** per **Cubie**

## Flagged ambiguities

- "position" was ambiguous between **Slot** (logical index) and the 3D coordinate of a **Mesh** — resolved: **Slot** = logical, mesh grid coordinate = view-only.
