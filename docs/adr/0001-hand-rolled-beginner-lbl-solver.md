# Hand-roll the beginner LBL solver instead of adopting a library

We need a solver that produces a human-teachable, layer-by-layer (beginner method) solution as staged output. Research across npm, GitHub, and the cubing.js ecosystem found no maintained, typed, beginner-LBL JavaScript solver. The only staged/human-output candidate, `rubiks-cube-solver` (2019, unmaintained, no TypeScript types), solves CFOP rather than pure beginner and emits slice (`M E S`) and wide moves, which conflicts with our 18-face-turn-only move set and would force slice support into both the engine and the renderer. All other libraries (`cubejs`, `cube-solver`, `min2phase.js`) are Kociemba two-phase solvers producing optimal, non-human solutions — wrong for a teaching tool.

We therefore build our own: cubie-level model, 18-move tables, then stage solvers (cross via BFS, first-layer corners, second-layer edges, 2-look OLL, 2-look PLL). Estimated ~6–8 focused days. `solve()` stays behind a swappable interface so a library can replace it later if one emerges.

## Consequences

- Correctness is gated by a property test: ~10,000 random scrambles must each solve to the solved state, plus move-table sanity checks (`move⁴ = identity`, `(R U R' U')×6 = identity`, `scramble · inverse = solved`), per-stage sub-goal invariants, and per-stage move caps to fail loudly instead of hanging.
- The solver reads the cubie model directly — no facelet round-trip needed.
- Risk concentrates in case recognition and AUF setup, not in the published algorithms themselves.
