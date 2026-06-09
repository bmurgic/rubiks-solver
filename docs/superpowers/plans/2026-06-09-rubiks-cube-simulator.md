# Rubik's Cube Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser app that scrambles a 3x3 cube and plays back a beginner-method (layer-by-layer) solution as a staged, step-through 3D animation.

**Architecture:** Two layers — `src/core/` is pure TypeScript (cubie-level engine, hand-rolled 6-stage LBL solver, playback state machine) with zero three.js/React imports, enforced by eslint. `src/view/` renders 26 static meshes recolored from derived facelets; turns animate via a temporary pivot group. Spec: `docs/superpowers/specs/2026-06-09-rubiks-cube-simulator-design.md`. Glossary: `CONTEXT.md`. ADRs 0001/0002 govern the solver.

**Tech Stack:** Vite, React 18, TypeScript, three.js + @react-three/fiber + @react-three/drei, Vitest, Playwright.

**Conventions used below:** All state is immutable (`apply` returns new state). Slot/orientation semantics are Kociemba-standard (see CONTEXT.md). Move tables use *replaced-by* semantics: `newState.cp[i] = state.cp[table.cp[i]]`. Our color convention: U=yellow, R=orange, F=green, D=white, L=red, B=blue (standard Western scheme held white-down).

**A note on solver case tables:** The stage algorithms below are the standard published beginner-method algorithms. If a per-stage property test fails, the bug is almost certainly in a recognition rule or a left/right alg variant — fix the table entry, never weaken the test. Reference for move tables and facelet maps: Kociemba's CubieCube definitions (kociemba.org/cube.htm).

> **Plan-polish constraints (apply throughout):**
> - **[coding-standards]** No `any` or `as unknown as` casts. Every meaningful numeric (move caps, loop guards, durations, spacing) becomes an `UPPER_SNAKE_CASE` module constant when writing the files — some code blocks below show values inline for brevity. Functions target ~40 lines; split stage solvers into per-case helpers if a file nears 400 lines. Public core API gets JSDoc (Task 8 Step 3b).
> - **[tdd-workflow]** Never skip the verify-FAIL step. Refactor-while-green before each commit. Coverage gate (`npm run test:coverage`, 80% on `src/core/**`) is part of every task's done-definition.
> - **[frontend-patterns]** The r3f scene stays behind lazy + Suspense + ErrorBoundary from Task 1 on. Memoize pure components (`Cubelet`). Handlers stay stable via `useCallback`; all playback state lives in the single `useReducer` store — no ad-hoc `useState` flags.

---

## File structure

```
src/core/cube-model/state.ts        CubeState, Corner/Edge enums, solved()
src/core/cube-model/moves.ts        Move, Face, move(), inverse()
src/core/cube-model/tables.ts       6 base quarter-turn tables
src/core/cube-model/apply.ts        apply(state, move)
src/core/notation/notation.ts       parse()/format()
src/core/scramble/rng.ts            mulberry32 seedable RNG
src/core/scramble/scramble.ts       scramble(rng, length)
src/core/validate/validate.ts       assertSolvable(), UnsolvableCubeError
src/core/facelets/facelets.ts       toFacelets(), facelet/color tables
src/core/solver/types.ts            Stage, StageName, StageCapError
src/core/solver/emitter.ts          Emitter (records + applies moves, enforces cap)
src/core/solver/recognition.ts      findEdge/findCorner/sticker helpers
src/core/solver/cleanup.ts          within-stage move merging
src/core/solver/stages/daisy.ts
src/core/solver/stages/cross.ts
src/core/solver/stages/first-layer.ts
src/core/solver/stages/second-layer.ts
src/core/solver/stages/oll.ts
src/core/solver/stages/pll.ts
src/core/solver/solve.ts            solve(state): Stage[] — pipeline
src/core/playback/snapshots.ts      buildSnapshots()
src/core/index.ts                   public core API re-exports
src/view/colors.ts                  FaceName→hex map
src/view/facelet-grid.ts            facelet index ↔ mesh grid mapping
src/view/CubeView.tsx               26 cubelets, pivot turn animation
src/view/ErrorBoundary.tsx          class error boundary around the canvas
src/view/ControlPanel.tsx           buttons, timeline, speed
src/App.tsx                         app state machine wiring (useReducer)
e2e/journey.spec.ts                 Playwright journey
```

Tests are colocated: `foo.ts` → `foo.test.ts`. The 10k gate lives in `src/core/solver/solve.gate.test.ts`. Coverage (80% lines/functions/branches/statements on `src/core/**`) is enforced via `npm run test:coverage`. E2E uses semantic selectors only (`data-testid`, `getByRole`) — never CSS classes.

---

### Task 1: [frontend-patterns] Walking skeleton — solved cube renders in the browser

**Depends on:** none

**Files:**
- Create: project scaffold, `src/core/cube-model/state.ts`, `src/core/facelets/facelets.ts`, `src/view/colors.ts`, `src/view/facelet-grid.ts`, `src/view/CubeView.tsx`, `src/App.tsx`
- Test: `src/core/facelets/facelets.test.ts`
- Modify: `eslint.config.js`, `vite.config.ts`, `package.json`

- [ ] **Step 1: Scaffold**

```bash
cd /Users/bmurgic/Development/Personal/rubiks-sim
npm create vite@latest . -- --template react-ts
npm install
npm install three @react-three/fiber @react-three/drei
npm install -D vitest @vitest/coverage-v8
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`. Add to `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/core/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 2: Enforce the core boundary**

In `eslint.config.js`, add an override after the existing entries:

```js
{
  files: ['src/core/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['three', 'three/*', 'react', 'react-*', '@react-three/*'],
        message: 'src/core must stay pure TypeScript (see design doc).',
      }],
    }],
  },
},
```

Run: `npm run lint` → passes.

- [ ] **Step 3: Write failing test for solved-state facelets**

`src/core/facelets/facelets.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { solved } from '../cube-model/state';
import { toFacelets } from './facelets';

test('solved cube derives 9 stickers of each face color in face order U,R,F,D,L,B', () => {
  const f = toFacelets(solved());
  expect(f).toHaveLength(54);
  const faces = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
  faces.forEach((face, i) => {
    expect(f.slice(i * 9, i * 9 + 9)).toEqual(Array(9).fill(face));
  });
});
```

- [ ] **Step 4: Run test, verify failure**

Run: `npm test` → FAIL (modules don't exist).

- [ ] **Step 5: Implement state + facelets**

`src/core/cube-model/state.ts`:

```ts
export const Corner = { URF: 0, UFL: 1, ULB: 2, UBR: 3, DFR: 4, DLF: 5, DBL: 6, DRB: 7 } as const;
export const Edge = { UR: 0, UF: 1, UL: 2, UB: 3, DR: 4, DF: 5, DL: 6, DB: 7, FR: 8, FL: 9, BL: 10, BR: 11 } as const;

export interface CubeState {
  readonly cp: readonly number[]; // cp[slot] = corner cubie occupying slot
  readonly co: readonly number[]; // co[slot] = twist 0|1|2 (Kociemba rule)
  readonly ep: readonly number[];
  readonly eo: readonly number[]; // 0|1 (Kociemba flip rule)
}

export function solved(): CubeState {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export function isSolved(s: CubeState): boolean {
  const z = solved();
  return (['cp', 'co', 'ep', 'eo'] as const).every(
    (k) => s[k].length === z[k].length && s[k].every((v, i) => v === z[k][i]),
  );
}
```

`src/core/facelets/facelets.ts` (facelet indices are face-major, 9 per face, order U,R,F,D,L,B; tables transcribed from Kociemba's facelet model):

```ts
import type { CubeState } from '../cube-model/state';

export type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACE_ORDER: readonly FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];

// Facelet positions (0-53) of the 3 stickers of each corner SLOT, in orientation order.
export const CORNER_FACELET: readonly (readonly number[])[] = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
// Facelet positions of the 2 stickers of each edge SLOT.
export const EDGE_FACELET: readonly (readonly number[])[] = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
// Sticker colors of each corner/edge CUBIE, in orientation order.
export const CORNER_COLOR: readonly (readonly FaceName[])[] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
export const EDGE_COLOR: readonly (readonly FaceName[])[] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'], ['D', 'R'], ['D', 'F'],
  ['D', 'L'], ['D', 'B'], ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];
// The faces each SLOT touches (same geometry as EDGE_COLOR/CORNER_COLOR read slot-wise).
export const EDGE_FACES = EDGE_COLOR;
export const CORNER_FACES = CORNER_COLOR;

export function toFacelets(s: CubeState): FaceName[] {
  const f = new Array<FaceName>(54);
  FACE_ORDER.forEach((face, i) => { f[i * 9 + 4] = face; }); // fixed centers
  for (let slot = 0; slot < 8; slot++) {
    for (let k = 0; k < 3; k++) {
      f[CORNER_FACELET[slot][(k + s.co[slot]) % 3]] = CORNER_COLOR[s.cp[slot]][k];
    }
  }
  for (let slot = 0; slot < 12; slot++) {
    for (let k = 0; k < 2; k++) {
      f[EDGE_FACELET[slot][(k + s.eo[slot]) % 2]] = EDGE_COLOR[s.ep[slot]][k];
    }
  }
  return f;
}
```

- [ ] **Step 6: Run test, verify pass**

Run: `npm test` → PASS.

- [ ] **Step 7: Render the cube**

`src/view/colors.ts`:

```ts
import type { FaceName } from '../core/facelets/facelets';

export const FACE_COLORS: Record<FaceName, string> = {
  U: '#FFD500', R: '#FF8000', F: '#009E60', D: '#FFFFFF', L: '#C41E3A', B: '#0051BA',
};
export const PLASTIC = '#101010';
```

`src/view/facelet-grid.ts` — maps a cubelet grid position + outward normal to its facelet index (row/col formulas derived from the Kociemba facelet layout; verify visually in Step 9):

```ts
import { FACE_ORDER, type FaceName } from '../core/facelets/facelets';

export type Vec3 = readonly [number, number, number];

// (r, c) within a face from grid coords x,y,z ∈ {-1,0,1}
const RC: Record<FaceName, (x: number, y: number, z: number) => [number, number]> = {
  U: (x, _y, z) => [z + 1, x + 1],
  R: (_x, y, z) => [1 - y, 1 - z],
  F: (x, y) => [1 - y, x + 1],
  D: (x, _y, z) => [1 - z, x + 1],
  L: (_x, y, z) => [1 - y, z + 1],
  B: (x, y) => [1 - y, 1 - x],
};
const NORMAL_FACE: Array<{ n: Vec3; face: FaceName }> = [
  { n: [0, 1, 0], face: 'U' }, { n: [1, 0, 0], face: 'R' }, { n: [0, 0, 1], face: 'F' },
  { n: [0, -1, 0], face: 'D' }, { n: [-1, 0, 0], face: 'L' }, { n: [0, 0, -1], face: 'B' },
];

export function faceletIndexAt(pos: Vec3, normal: Vec3): number | null {
  const hit = NORMAL_FACE.find(({ n }) => n[0] === normal[0] && n[1] === normal[1] && n[2] === normal[2]);
  if (!hit) return null;
  const [x, y, z] = pos;
  const onSurface = (hit.n[0] !== 0 && x === hit.n[0]) || (hit.n[1] !== 0 && y === hit.n[1]) || (hit.n[2] !== 0 && z === hit.n[2]);
  if (!onSurface) return null;
  const [r, c] = RC[hit.face](x, y, z);
  return FACE_ORDER.indexOf(hit.face) * 9 + r * 3 + c;
}
```

`src/view/CubeView.tsx` (static version; pivot animation arrives in Task 3):

```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo } from 'react';
import type { FaceName } from '../core/facelets/facelets';
import { FACE_COLORS, PLASTIC } from './colors';
import { faceletIndexAt, type Vec3 } from './facelet-grid';

const GRID = [-1, 0, 1];
// three.js BoxGeometry material order: +x, -x, +y, -y, +z, -z
const BOX_NORMALS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const POSITIONS: Vec3[] = GRID.flatMap((x) =>
  GRID.flatMap((y) => GRID.map((z) => [x, y, z] as Vec3)),
).filter(([x, y, z]) => !(x === 0 && y === 0 && z === 0)); // 26 cubelets, no hidden core

function Cubelet({ pos, facelets }: { pos: Vec3; facelets: FaceName[] }) {
  const colors = useMemo(
    () => BOX_NORMALS.map((n) => {
      const idx = faceletIndexAt(pos, n);
      return idx === null ? PLASTIC : FACE_COLORS[facelets[idx]];
    }),
    [pos, facelets],
  );
  return (
    <mesh position={[pos[0] * 1.05, pos[1] * 1.05, pos[2] * 1.05]}>
      <boxGeometry args={[1, 1, 1]} />
      {colors.map((c, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={c} />
      ))}
    </mesh>
  );
}

export function CubeView({ facelets }: { facelets: FaceName[] }) {
  return (
    <Canvas camera={{ position: [4.5, 4.5, 4.5], fov: 40 }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 10, 7]} intensity={1.5} />
      {POSITIONS.map((p) => (
        <Cubelet key={p.join(',')} pos={p} facelets={facelets} />
      ))}
      <OrbitControls enablePan={false} enableDamping minDistance={5} maxDistance={14} makeDefault />
    </Canvas>
  );
}
```

`src/view/ErrorBoundary.tsx` — [frontend-patterns] the canvas subtree must not blank the page on a thrown error (StageCapError, WebGL context loss):

```tsx
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <div>
            <p>Something went wrong rendering the cube.</p>
            <pre>{this.state.error.message}</pre>
            <button onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

`src/App.tsx` — [frontend-patterns] the heavy r3f scene loads lazily inside Suspense + ErrorBoundary; this shell persists through all later tasks:

```tsx
import { lazy, Suspense, useMemo, useState } from 'react';
import { solved } from './core/cube-model/state';
import { toFacelets } from './core/facelets/facelets';
import { ErrorBoundary } from './view/ErrorBoundary';

const CubeView = lazy(() => import('./view/CubeView').then((m) => ({ default: m.CubeView })));

export default function App() {
  const [state] = useState(solved());
  const facelets = useMemo(() => toFacelets(state), [state]);
  return (
    <div data-testid="app" style={{ width: '100vw', height: '100vh' }}>
      <ErrorBoundary>
        <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Loading cube…</div>}>
          <CubeView facelets={facelets} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
```

Delete the Vite template's `App.css` usage/content as needed; keep `index.css` minimal (`html, body, #root { margin: 0; height: 100%; }`).

- [ ] **Step 8: Verify build + lint + test + coverage**

Run: `npm run lint && npm test && npm run test:coverage && npm run build` → all pass; coverage meets the 80% thresholds for `src/core/**`.

- [ ] **Step 9: Manual visual check**

Run: `npm run dev`. Verify: solved cube, **yellow up, green front, orange right** (white down, red left, blue back) from the default three-quarter camera; orbit rotates, pan does nothing, zoom clamps. If a face's stickers are wrong, fix the corresponding `RC` formula in `facelet-grid.ts` (the core tables are test-verified; the grid mapping is the only visual unknown).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: walking skeleton — solved cube renders from core state"
```

---

### Task 2: [tdd-workflow] Move engine — tables, apply, notation, foundation tests

**Depends on:** Task 1

**Files:**
- Create: `src/core/cube-model/moves.ts`, `src/core/cube-model/tables.ts`, `src/core/cube-model/apply.ts`, `src/core/notation/notation.ts`
- Test: `src/core/cube-model/apply.test.ts`, `src/core/notation/notation.test.ts`

- [ ] **Step 1: Write failing foundation tests**

`src/core/cube-model/apply.test.ts`:

```ts
import { expect, test } from 'vitest';
import { isSolved, solved } from './state';
import { apply } from './apply';
import { inverse, move, type Move } from './moves';
import { parse } from '../notation/notation';

const FACES = ['U', 'D', 'L', 'R', 'F', 'B'] as const;

test.each(FACES)('%s applied 4 times is identity', (face) => {
  let s = solved();
  for (let i = 0; i < 4; i++) s = apply(s, move(face));
  expect(isSolved(s)).toBe(true);
});

test.each(FACES)('%s2 applied twice is identity', (face) => {
  let s = solved();
  s = apply(s, move(face, 2));
  s = apply(s, move(face, 2));
  expect(isSolved(s)).toBe(true);
});

test.each(FACES)("%s then %s' is identity", (face) => {
  const s = apply(apply(solved(), move(face)), inverse(move(face)));
  expect(isSolved(s)).toBe(true);
});

test("(R U R' U') six times is identity", () => {
  let s = solved();
  for (let i = 0; i < 6; i++) for (const m of parse("R U R' U'")) s = apply(s, m);
  expect(isSolved(s)).toBe(true);
});

test('a move sequence followed by its inverse is identity', () => {
  const seq = parse("R U2 F' D L2 B U' R2 F L D2 B'");
  let s = solved();
  for (const m of seq) s = apply(s, m);
  for (const m of [...seq].reverse().map(inverse)) s = apply(s, m);
  expect(isSolved(s)).toBe(true);
});

test('U permutes only the U layer and flips nothing', () => {
  const s = apply(solved(), move('U'));
  expect(s.cp).toEqual([3, 0, 1, 2, 4, 5, 6, 7]);
  expect(s.ep).toEqual([3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(s.co.every((v) => v === 0)).toBe(true);
  expect(s.eo.every((v) => v === 0)).toBe(true);
});
```

`src/core/notation/notation.test.ts`:

```ts
import { expect, test } from 'vitest';
import { format, parse } from './notation';

test('parses and formats round-trip', () => {
  const s = "R U R' U' F2 D' B2";
  expect(format(parse(s))).toBe(s);
});

test('rejects malformed notation', () => {
  expect(() => parse('R X')).toThrow();
  expect(() => parse("R''")).toThrow();
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test` → FAIL.

- [ ] **Step 3: Implement moves, tables, apply, notation**

`src/core/cube-model/moves.ts`:

```ts
export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Turns = 1 | 2 | 3; // 3 = counterclockwise (prime)
export interface Move { readonly face: Face; readonly turns: Turns }

export function move(face: Face, turns: Turns = 1): Move {
  return { face, turns };
}
export function inverse(m: Move): Move {
  return { face: m.face, turns: ((4 - m.turns) % 4) as Turns };
}
```

`src/core/cube-model/tables.ts` — the 6 hand-written clockwise quarter-turn tables, transcribed from Kociemba's CubieCube (replaced-by semantics):

```ts
import type { Face } from './moves';

export interface MoveTable {
  readonly cp: readonly number[]; readonly co: readonly number[];
  readonly ep: readonly number[]; readonly eo: readonly number[];
}

export const TABLES: Record<Face, MoveTable> = {
  U: { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0],
       ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  R: { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2],
       ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  F: { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0],
       ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
  D: { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0],
       ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  L: { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0],
       ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  B: { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1],
       ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
};
```

`src/core/cube-model/apply.ts` — prime/double are the base table applied 3×/2× (derived by construction, per design doc):

```ts
import type { CubeState } from './state';
import type { Move } from './moves';
import { TABLES, type MoveTable } from './tables';

function applyTable(s: CubeState, t: MoveTable): CubeState {
  return {
    cp: t.cp.map((src) => s.cp[src]),
    co: t.cp.map((src, i) => (s.co[src] + t.co[i]) % 3),
    ep: t.ep.map((src) => s.ep[src]),
    eo: t.ep.map((src, i) => (s.eo[src] + t.eo[i]) % 2),
  };
}

export function apply(state: CubeState, m: Move): CubeState {
  let s = state;
  for (let i = 0; i < m.turns; i++) s = applyTable(s, TABLES[m.face]);
  return s;
}

export function applyAll(state: CubeState, moves: readonly Move[]): CubeState {
  return moves.reduce(apply, state);
}
```

`src/core/notation/notation.ts`:

```ts
import type { Face, Move, Turns } from '../cube-model/moves';

const FACES = new Set(['U', 'D', 'L', 'R', 'F', 'B']);

export function parse(s: string): Move[] {
  return s.trim().split(/\s+/).filter(Boolean).map((tok) => {
    const face = tok[0] as Face;
    const suffix = tok.slice(1);
    if (!FACES.has(face) || !['', "'", '2'].includes(suffix)) {
      throw new Error(`Invalid move token: "${tok}"`);
    }
    const turns: Turns = suffix === "'" ? 3 : suffix === '2' ? 2 : 1;
    return { face, turns };
  });
}

export function format(moves: readonly Move[]): string {
  return moves.map((m) => m.face + (m.turns === 3 ? "'" : m.turns === 2 ? '2' : '')).join(' ');
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test` → all PASS. If a `×4 = identity` test fails, a base table was mistranscribed — diff against the tables above / Kociemba's source; do not adjust the test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: move engine — base tables, apply, notation, foundation tests"
```

---

### Task 3: [frontend-patterns] User can scramble — animated 25-move scramble

**Depends on:** Task 2

**Files:**
- Create: `src/core/scramble/rng.ts`, `src/core/scramble/scramble.ts`
- Modify: `src/view/CubeView.tsx`, `src/App.tsx`
- Test: `src/core/scramble/scramble.test.ts`

- [ ] **Step 1: Write failing scramble tests**

`src/core/scramble/scramble.test.ts`:

```ts
import { expect, test } from 'vitest';
import { mulberry32 } from './rng';
import { scramble } from './scramble';

const AXIS: Record<string, string> = { U: 'y', D: 'y', L: 'x', R: 'x', F: 'z', B: 'z' };

test('produces requested length, default 25', () => {
  expect(scramble(mulberry32(1))).toHaveLength(25);
});

test('never repeats a face consecutively, never three same-axis in a row', () => {
  for (let seed = 0; seed < 50; seed++) {
    const ms = scramble(mulberry32(seed));
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i].face).not.toBe(ms[i - 1].face);
      if (i >= 2) {
        const sameAxis = AXIS[ms[i].face] === AXIS[ms[i - 1].face] && AXIS[ms[i].face] === AXIS[ms[i - 2].face];
        expect(sameAxis).toBe(false);
      }
    }
  }
});

test('same seed gives same scramble', () => {
  expect(scramble(mulberry32(42))).toEqual(scramble(mulberry32(42)));
});
```

- [ ] **Step 2: Run, verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement rng + scramble**

`src/core/scramble/rng.ts`:

```ts
export type Rng = () => number; // [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`src/core/scramble/scramble.ts`:

```ts
import type { Face, Move, Turns } from '../cube-model/moves';
import type { Rng } from './rng';

const FACES: readonly Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
const AXIS: Record<Face, string> = { U: 'y', D: 'y', L: 'x', R: 'x', F: 'z', B: 'z' };
const TURNS: readonly Turns[] = [1, 2, 3];
const DEFAULT_SCRAMBLE_LENGTH = 25;

export function scramble(rng: Rng, length = DEFAULT_SCRAMBLE_LENGTH): Move[] {
  const out: Move[] = [];
  while (out.length < length) {
    const face = FACES[Math.floor(rng() * 6)];
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    if (prev && prev.face === face) continue;
    if (prev && prev2 && AXIS[face] === AXIS[prev.face] && AXIS[face] === AXIS[prev2.face]) continue;
    out.push({ face, turns: TURNS[Math.floor(rng() * 3)] });
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass** — `npm test` → PASS.

- [ ] **Step 5: Add the pivot turn animation to CubeView**

Replace `src/view/CubeView.tsx` with the animating version. Key design: cubelets whose grid position belongs to the turning face render inside a `<group>` whose rotation is advanced in `useFrame`; when the quarter/half turn completes, `onTurnComplete` fires — the App applies the logical move (recolor) and the group resets to zero. Rotated-old-colors equals reset-new-colors, so the frame is seamless.

```tsx
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { memo, useMemo, useRef } from 'react';
import type { Group } from 'three';
import type { FaceName } from '../core/facelets/facelets';
import type { Move } from '../core/cube-model/moves';
import { FACE_COLORS, PLASTIC } from './colors';
import { faceletIndexAt, type Vec3 } from './facelet-grid';

const GRID = [-1, 0, 1];
const BOX_NORMALS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const POSITIONS: Vec3[] = GRID.flatMap((x) =>
  GRID.flatMap((y) => GRID.map((z) => [x, y, z] as Vec3)),
).filter(([x, y, z]) => !(x === 0 && y === 0 && z === 0));

// Which grid positions belong to each face (constant — meshes never move).
const FACE_SELECTOR: Record<string, (p: Vec3) => boolean> = {
  U: (p) => p[1] === 1, D: (p) => p[1] === -1, R: (p) => p[0] === 1,
  L: (p) => p[0] === -1, F: (p) => p[2] === 1, B: (p) => p[2] === -1,
};
// Rotation axis (face normal); clockwise turn = negative rotation about it.
const FACE_AXIS: Record<string, Vec3> = {
  U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1],
};

export interface Turn { move: Move; durationMs: number; onComplete: () => void }

// [frontend-patterns] memoized — 26 instances; skip re-render when pos/facelets are unchanged
const Cubelet = memo(function Cubelet({ pos, facelets }: { pos: Vec3; facelets: FaceName[] }) {
  const colors = useMemo(
    () => BOX_NORMALS.map((n) => {
      const idx = faceletIndexAt(pos, n);
      return idx === null ? PLASTIC : FACE_COLORS[facelets[idx]];
    }),
    [pos, facelets],
  );
  return (
    <mesh position={[pos[0] * 1.05, pos[1] * 1.05, pos[2] * 1.05]}>
      <boxGeometry args={[1, 1, 1]} />
      {colors.map((c, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={c} />
      ))}
    </mesh>
  );
});

function TurningGroup({ turn, children }: { turn: Turn; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const target = -(Math.PI / 2) * (turn.move.turns === 3 ? -1 : turn.move.turns); // 3 (prime) = +90°
  const axis = FACE_AXIS[turn.move.face];

  useFrame((_, delta) => {
    if (done.current || !ref.current) return;
    elapsed.current += delta * 1000;
    const t = Math.min(elapsed.current / turn.durationMs, 1);
    const angle = target * t;
    ref.current.rotation.set(axis[0] * angle, axis[1] * angle, axis[2] * angle);
    if (t === 1) {
      done.current = true;
      ref.current.rotation.set(0, 0, 0); // reset; recolor happens via onComplete state change
      turn.onComplete();
    }
  });
  return <group ref={ref}>{children}</group>;
}

export function CubeView({ facelets, turn }: { facelets: FaceName[]; turn: Turn | null }) {
  const turning = turn ? POSITIONS.filter(FACE_SELECTOR[turn.move.face]) : [];
  const still = turn ? POSITIONS.filter((p) => !FACE_SELECTOR[turn.move.face](p)) : POSITIONS;
  return (
    <Canvas camera={{ position: [4.5, 4.5, 4.5], fov: 40 }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 10, 7]} intensity={1.5} />
      {still.map((p) => <Cubelet key={p.join(',')} pos={p} facelets={facelets} />)}
      {turn && (
        <TurningGroup key={`${turn.move.face}${turn.move.turns}-${facelets.join('')}`} turn={turn}>
          {turning.map((p) => <Cubelet key={p.join(',')} pos={p} facelets={facelets} />)}
        </TurningGroup>
      )}
      <OrbitControls enablePan={false} enableDamping minDistance={5} maxDistance={14} makeDefault />
    </Canvas>
  );
}
```

Direction sanity: a clockwise U (viewed from above, i.e. looking down −y) is a −90° rotation about +y. If a face animates backwards in Step 8's visual check, flip the sign for that face in `FACE_AXIS` (the logical result is table-driven and already correct; only the animation direction is cosmetic).

- [ ] **Step 6: Wire the app state machine with Scramble**

Replace `src/App.tsx`:

```tsx
import { lazy, Suspense, useCallback, useMemo, useReducer } from 'react';
import { solved, type CubeState } from './core/cube-model/state';
import { apply } from './core/cube-model/apply';
import type { Move } from './core/cube-model/moves';
import { toFacelets } from './core/facelets/facelets';
import { mulberry32 } from './core/scramble/rng';
import { scramble } from './core/scramble/scramble';
import { ErrorBoundary } from './view/ErrorBoundary';
import type { Turn } from './view/CubeView';

const CubeView = lazy(() => import('./view/CubeView').then((m) => ({ default: m.CubeView })));

type Phase = 'SOLVED' | 'SCRAMBLING' | 'SCRAMBLED' | 'PLAYING' | 'PAUSED';

interface AppState {
  phase: Phase;
  cube: CubeState;
  queue: Move[];      // moves still to animate (scramble for now; playback later)
  queueIndex: number;
}

type Action =
  | { type: 'SCRAMBLE'; moves: Move[] }
  | { type: 'TURN_DONE' };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'SCRAMBLE':
      return { phase: 'SCRAMBLING', cube: solved(), queue: a.moves, queueIndex: 0 };
    case 'TURN_DONE': {
      const cube = apply(s.cube, s.queue[s.queueIndex]);
      const next = s.queueIndex + 1;
      if (next >= s.queue.length) return { ...s, cube, queueIndex: next, phase: 'SCRAMBLED' };
      return { ...s, cube, queueIndex: next };
    }
  }
}

const SCRAMBLE_MS = 180;

export default function App() {
  const [s, dispatch] = useReducer(reducer, {
    phase: 'SOLVED', cube: solved(), queue: [], queueIndex: 0,
  });
  const facelets = useMemo(() => toFacelets(s.cube), [s.cube]);
  const onScramble = useCallback(() => {
    dispatch({ type: 'SCRAMBLE', moves: scramble(mulberry32(Date.now() >>> 0)) });
  }, []);

  const turn: Turn | null =
    s.phase === 'SCRAMBLING' && s.queueIndex < s.queue.length
      ? { move: s.queue[s.queueIndex], durationMs: SCRAMBLE_MS, onComplete: () => dispatch({ type: 'TURN_DONE' }) }
      : null;

  return (
    <div data-testid="app" data-phase={s.phase} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <ErrorBoundary>
        <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Loading cube…</div>}>
          <CubeView facelets={facelets} turn={turn} />
        </Suspense>
      </ErrorBoundary>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button data-testid="scramble" onClick={onScramble} style={{ fontSize: 20, padding: '12px 24px' }}>
          🔀 Scramble
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Lint + test** — `npm run lint && npm test` → PASS.

- [ ] **Step 8: Manual visual check**

`npm run dev` → click Scramble: 25 turns animate smoothly, cube ends scrambled, `data-phase` reaches `SCRAMBLED` (inspect DOM). Scramble again mid-anything: hard reset works (state machine restarts from solved). Check turn directions look physically sensible; fix `FACE_AXIS` signs if a face spins the wrong way.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: animated 25-move scramble with seeded RNG and app state machine"
```

---

### Task 4: [tdd-workflow] Solve through Cross — solver scaffold, Daisy + Cross stages, playback skeleton

**Depends on:** Task 3

**Files:**
- Create: `src/core/validate/validate.ts`, `src/core/solver/types.ts`, `src/core/solver/emitter.ts`, `src/core/solver/recognition.ts`, `src/core/solver/cleanup.ts`, `src/core/solver/stages/daisy.ts`, `src/core/solver/stages/cross.ts`, `src/core/solver/solve.ts`, `src/core/playback/snapshots.ts`
- Modify: `src/App.tsx`
- Test: `src/core/validate/validate.test.ts`, `src/core/solver/cleanup.test.ts`, `src/core/solver/stages/daisy.test.ts`, `src/core/solver/stages/cross.test.ts`, `src/core/playback/snapshots.test.ts`

- [ ] **Step 1: Write failing validate tests**

`src/core/validate/validate.test.ts`:

```ts
import { expect, test } from 'vitest';
import { solved } from '../cube-model/state';
import { applyAll } from '../cube-model/apply';
import { mulberry32 } from '../scramble/rng';
import { scramble } from '../scramble/scramble';
import { assertSolvable, UnsolvableCubeError } from './validate';

test('solved and scrambled states pass', () => {
  expect(() => assertSolvable(solved())).not.toThrow();
  expect(() => assertSolvable(applyAll(solved(), scramble(mulberry32(7))))).not.toThrow();
});

test('single twisted corner violates twist invariant', () => {
  const s = solved();
  const bad = { ...s, co: [1, ...s.co.slice(1)] };
  expect(() => assertSolvable(bad)).toThrow(UnsolvableCubeError);
  expect(() => assertSolvable(bad)).toThrow(/twist/);
});

test('single flipped edge violates flip invariant', () => {
  const s = solved();
  const bad = { ...s, eo: [1, ...s.eo.slice(1)] };
  expect(() => assertSolvable(bad)).toThrow(/flip/);
});

test('two swapped edges alone violate parity invariant', () => {
  const s = solved();
  const ep = [...s.ep]; [ep[0], ep[1]] = [ep[1], ep[0]];
  expect(() => assertSolvable({ ...s, ep })).toThrow(/parity/);
});

test('duplicate cubie violates structure invariant', () => {
  const s = solved();
  expect(() => assertSolvable({ ...s, cp: [0, 0, 2, 3, 4, 5, 6, 7] })).toThrow(/structure/);
});
```

- [ ] **Step 2: Run, verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement validate**

`src/core/validate/validate.ts`:

```ts
import type { CubeState } from '../cube-model/state';

export class UnsolvableCubeError extends Error {
  constructor(public readonly invariant: 'structure' | 'twist' | 'flip' | 'parity') {
    super(`Cube state is unsolvable: ${invariant} invariant violated`);
    this.name = 'UnsolvableCubeError';
  }
}

function parity(p: readonly number[]): number {
  let inv = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
  return inv % 2;
}

export function assertSolvable(s: CubeState): void {
  const isPerm = (p: readonly number[], n: number) =>
    p.length === n && [...p].sort((a, b) => a - b).every((v, i) => v === i);
  if (!isPerm(s.cp, 8) || !isPerm(s.ep, 12) ||
      s.co.some((v) => v < 0 || v > 2) || s.eo.some((v) => v < 0 || v > 1)) {
    throw new UnsolvableCubeError('structure');
  }
  if (s.co.reduce((a, b) => a + b, 0) % 3 !== 0) throw new UnsolvableCubeError('twist');
  if (s.eo.reduce((a, b) => a + b, 0) % 2 !== 0) throw new UnsolvableCubeError('flip');
  if (parity(s.cp) !== parity(s.ep)) throw new UnsolvableCubeError('parity');
}
```

- [ ] **Step 4: Run, verify pass** — `npm test` → PASS. Commit:

```bash
git add -A && git commit -m "feat: solvability validation with typed UnsolvableCubeError"
```

- [ ] **Step 5: Solver scaffold (types, emitter, recognition, cleanup) + cleanup tests**

`src/core/solver/types.ts`:

```ts
import type { Move } from '../cube-model/moves';

export type StageName = 'Daisy' | 'Cross' | 'First Layer' | 'Second Layer' | 'OLL' | 'PLL';
export const STAGE_NAMES: readonly StageName[] = ['Daisy', 'Cross', 'First Layer', 'Second Layer', 'OLL', 'PLL'];

export interface Stage { readonly name: StageName; readonly moves: readonly Move[] }

export class StageCapError extends Error {
  constructor(stage: StageName, detail: string) {
    super(`Solver stage "${stage}" failed: ${detail}`);
    this.name = 'StageCapError';
  }
}
```

`src/core/solver/emitter.ts`:

```ts
import type { CubeState } from '../cube-model/state';
import type { Move } from '../cube-model/moves';
import { apply } from '../cube-model/apply';
import { parse } from '../notation/notation';
import { StageCapError, type StageName } from './types';

export class Emitter {
  state: CubeState;
  readonly moves: Move[] = [];
  constructor(state: CubeState, private readonly cap: number, private readonly stage: StageName) {
    this.state = state;
  }
  do(seq: string | readonly Move[]): void {
    const ms = typeof seq === 'string' ? parse(seq) : seq;
    for (const m of ms) {
      this.state = apply(this.state, m);
      this.moves.push(m);
      if (this.moves.length > this.cap) {
        throw new StageCapError(this.stage, `exceeded ${this.cap}-move cap`);
      }
    }
  }
}

export function rotateUUntil(e: Emitter, pred: (s: CubeState) => boolean): void {
  for (let i = 0; i < 4; i++) {
    if (pred(e.state)) return;
    e.do('U');
  }
  throw new StageCapError('Daisy', 'U-setup predicate never satisfied'); // stage name refined by caller context in practice
}
```

(`rotateUUntil` throwing with a fixed stage label is acceptable — the error message carries the predicate failure; refine only if debugging demands it.)

`src/core/solver/recognition.ts`:

```ts
import type { CubeState } from '../cube-model/state';
import { CORNER_COLOR, CORNER_FACES, EDGE_COLOR, EDGE_FACES, type FaceName } from '../facelets/facelets';

export function edgeSlot(s: CubeState, cubie: number): number {
  return s.ep.indexOf(cubie);
}
export function cornerSlot(s: CubeState, cubie: number): number {
  return s.cp.indexOf(cubie);
}
/** Color showing on `face` at edge `slot`, or null if that slot doesn't touch the face. */
export function edgeSticker(s: CubeState, slot: number, face: FaceName): FaceName | null {
  for (let k = 0; k < 2; k++) {
    if (EDGE_FACES[slot][(k + s.eo[slot]) % 2] === face) return EDGE_COLOR[s.ep[slot]][k];
  }
  return null;
}
export function cornerSticker(s: CubeState, slot: number, face: FaceName): FaceName | null {
  for (let k = 0; k < 3; k++) {
    if (CORNER_FACES[slot][(k + s.co[slot]) % 3] === face) return CORNER_COLOR[s.cp[slot]][k];
  }
  return null;
}
/** The face the WHITE sticker of a white (D-color) edge currently faces. */
export function whiteEdgeFace(s: CubeState, slot: number): FaceName {
  return EDGE_FACES[slot][s.eo[slot]] as FaceName; // white is color k=0 of D-edges
}
```

`src/core/solver/cleanup.ts` + test:

```ts
import type { Move, Turns } from '../cube-model/moves';

/** Merge/cancel adjacent same-face moves. Within-stage only — callers pass one stage's moves. */
export function cleanup(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    let merged: Move | undefined = m;
    while (merged && out.length > 0 && out[out.length - 1].face === merged.face) {
      const prev = out.pop()!;
      const combined = (prev.turns + merged.turns) % 4;
      merged = combined === 0 ? undefined : { face: merged.face, turns: combined as Turns };
    }
    if (merged) out.push(merged);
  }
  return out;
}
```

`src/core/solver/cleanup.test.ts`:

```ts
import { expect, test } from 'vitest';
import { parse, format } from '../notation/notation';
import { cleanup } from './cleanup';
import { applyAll } from '../cube-model/apply';
import { solved } from '../cube-model/state';
import { mulberry32 } from '../scramble/rng';
import { scramble } from '../scramble/scramble';

test("R R' cancels, U U merges to U2, U2 U2 cancels", () => {
  expect(format(cleanup(parse("R R'")))).toBe('');
  expect(format(cleanup(parse('U U')))).toBe('U2');
  expect(format(cleanup(parse('U2 U2 F')))).toBe('F');
});

test('cleaned sequence reaches the same state as the raw sequence', () => {
  for (let seed = 0; seed < 30; seed++) {
    const raw = [...scramble(mulberry32(seed)), ...parse("R R' U U F2 F2 D D D D")];
    expect(applyAll(solved(), cleanup(raw))).toEqual(applyAll(solved(), raw));
  }
});
```

Run: `npm test` → cleanup tests PASS. Commit:

```bash
git add -A && git commit -m "feat: solver scaffold — emitter, recognition helpers, within-stage cleanup"
```

- [ ] **Step 6: Write failing Daisy tests**

`src/core/solver/stages/daisy.test.ts`:

```ts
import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy, daisyDone } from './daisy';

test('daisy invariant holds after stage, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const { stage, state } = solveDaisy(start);
    expect(daisyDone(state)).toBe(true);
    // returned moves reproduce the returned state
    expect(applyAll(start, stage.moves)).toEqual(state);
    expect(stage.name).toBe('Daisy');
  }
});

test('already-done daisy emits zero moves', () => {
  // solved cube has white edges on D, not a daisy — build one: lift all four (F2 B2 R2 L2 makes a daisy from solved)
  const start = applyAll(solved(), [
    { face: 'F', turns: 2 }, { face: 'B', turns: 2 }, { face: 'R', turns: 2 }, { face: 'L', turns: 2 },
  ] as const);
  expect(daisyDone(start)).toBe(true);
  expect(solveDaisy(start).stage.moves).toHaveLength(0);
});
```

- [ ] **Step 7: Run, verify failure** — `npm test` → FAIL.

- [ ] **Step 8: Implement Daisy**

`src/core/solver/stages/daisy.ts`:

```ts
import type { CubeState } from '../../cube-model/state';
import { Edge } from '../../cube-model/state';
import type { Face } from '../../cube-model/moves';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { edgeSlot, whiteEdgeFace } from '../recognition';
import { StageCapError, type Stage } from '../types';

export const WHITE_EDGES = [Edge.DR, Edge.DF, Edge.DL, Edge.DB] as const;
export const U_SLOT_OF_FACE: Partial<Record<Face, number>> = {
  R: Edge.UR, F: Edge.UF, L: Edge.UL, B: Edge.UB,
};
const D_SLOT_SIDE: Record<number, Face> = {
  [Edge.DR]: 'R', [Edge.DF]: 'F', [Edge.DL]: 'L', [Edge.DB]: 'B',
};
// E-layer lift: slot → (face the white sticker shows → move that lifts the edge into U with white up)
const E_LIFT: Record<number, Partial<Record<Face, string>>> = {
  [Edge.FR]: { F: 'R', R: "F'" },
  [Edge.FL]: { F: "L'", L: 'F' },
  [Edge.BL]: { B: 'L', L: "B'" },
  [Edge.BR]: { B: "R'", R: 'B' },
};

function isPetalAt(s: CubeState, uSlot: number): boolean {
  const cubie = s.ep[uSlot];
  return (WHITE_EDGES as readonly number[]).includes(cubie) && whiteEdgeFace(s, uSlot) === 'U';
}
function isPlaced(s: CubeState, cubie: number): boolean {
  const slot = edgeSlot(s, cubie);
  return slot <= 3 && whiteEdgeFace(s, slot) === 'U';
}
export function daisyDone(s: CubeState): boolean {
  return WHITE_EDGES.every((c) => isPlaced(s, c));
}

function placeEdge(e: Emitter, cubie: number): void {
  for (let guard = 0; guard < 6; guard++) {
    const slot = edgeSlot(e.state, cubie);
    const white = whiteEdgeFace(e.state, slot);
    if (slot <= 3) {
      if (white === 'U') return; // placed
      e.do(white); // flipped in U layer: drop into E layer via the side face it shows white on
      continue;
    }
    if (slot <= 7) {
      const side = D_SLOT_SIDE[slot];
      if (white === 'D') {
        rotateUUntil(e, (s) => !isPetalAt(s, U_SLOT_OF_FACE[side]!));
        e.do(`${side}2`);
        return;
      }
      e.do(side); // white shows on the side face: one turn moves it to the E layer
      continue;
    }
    // E layer: lift with the *other* face, protecting the destination petal slot
    const lift = E_LIFT[slot][white]!;
    const destFace = lift[0] as Face;
    rotateUUntil(e, (s) => !isPetalAt(s, U_SLOT_OF_FACE[destFace]!));
    e.do(lift);
    return;
  }
  throw new StageCapError('Daisy', `edge ${cubie} did not place`);
}

export function solveDaisy(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, 60, 'Daisy');
  for (let guard = 0; guard < 8 && !daisyDone(e.state); guard++) {
    const next = WHITE_EDGES.find((c) => !isPlaced(e.state, c));
    if (next === undefined) break;
    placeEdge(e, next);
  }
  if (!daisyDone(e.state)) throw new StageCapError('Daisy', 'did not converge');
  return { stage: { name: 'Daisy', moves: cleanup(e.moves) }, state: e.state };
}
```

- [ ] **Step 9: Run, verify pass** — `npm test` → PASS. Commit:

```bash
git add -A && git commit -m "feat: daisy stage solver with 300-scramble property test"
```

- [ ] **Step 10: Write failing Cross tests, implement Cross**

`src/core/solver/stages/cross.test.ts`:

```ts
import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';

test('cross invariant holds after daisy+cross, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const afterDaisy = solveDaisy(start).state;
    const { stage, state } = solveCross(afterDaisy);
    expect(crossDone(state)).toBe(true);
    expect(applyAll(afterDaisy, stage.moves)).toEqual(state);
  }
});
```

Run → FAIL. Then `src/core/solver/stages/cross.ts`:

```ts
import type { CubeState } from '../../cube-model/state';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { edgeSlot } from '../recognition';
import { EDGE_COLOR } from '../../facelets/facelets';
import type { Face } from '../../cube-model/moves';
import type { Stage } from '../types';
import { WHITE_EDGES, U_SLOT_OF_FACE } from './daisy';

export function crossDone(s: CubeState): boolean {
  return WHITE_EDGES.every((c) => s.ep[c] === c && s.eo[c] === 0);
}

export function solveCross(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, 32, 'Cross');
  for (const cubie of WHITE_EDGES) {
    if (e.state.ep[cubie] === cubie && e.state.eo[cubie] === 0) continue;
    const side = EDGE_COLOR[cubie][1] as Face; // the edge's non-white color = its home side face
    rotateUUntil(e, (s) => edgeSlot(s, cubie) === U_SLOT_OF_FACE[side]);
    e.do(`${side}2`);
  }
  return { stage: { name: 'Cross', moves: cleanup(e.moves) }, state: e.state };
}
```

Run: `npm test` → PASS. Commit: `git add -A && git commit -m "feat: cross stage solver"`.

- [ ] **Step 11: Snapshots + solve() pipeline + tests**

`src/core/playback/snapshots.test.ts`:

```ts
import { expect, test } from 'vitest';
import { solved } from '../cube-model/state';
import { apply } from '../cube-model/apply';
import { parse } from '../notation/notation';
import { buildSnapshots } from './snapshots';

test('snapshots: states[i+1] = apply(states[i], moves[i]), length = moves+1', () => {
  const moves = parse("R U R' U' F2 D");
  const snaps = buildSnapshots(solved(), moves);
  expect(snaps).toHaveLength(moves.length + 1);
  moves.forEach((m, i) => expect(snaps[i + 1]).toEqual(apply(snaps[i], m)));
});
```

`src/core/playback/snapshots.ts`:

```ts
import type { CubeState } from '../cube-model/state';
import type { Move } from '../cube-model/moves';
import { apply } from '../cube-model/apply';

export function buildSnapshots(start: CubeState, moves: readonly Move[]): CubeState[] {
  const out = [start];
  for (const m of moves) out.push(apply(out[out.length - 1], m));
  return out;
}
```

`src/core/solver/solve.ts` — pipeline grows as stages land in Tasks 5–8:

```ts
import type { CubeState } from '../cube-model/state';
import { assertSolvable } from '../validate/validate';
import type { Stage } from './types';
import { solveDaisy } from './stages/daisy';
import { solveCross } from './stages/cross';

type StageSolver = (s: CubeState) => { stage: Stage; state: CubeState };

// Tasks 5-8 append: solveFirstLayer, solveSecondLayer, solveOll, solvePll
const PIPELINE: StageSolver[] = [solveDaisy, solveCross];

export function solve(state: CubeState): Stage[] {
  assertSolvable(state);
  const stages: Stage[] = [];
  let s = state;
  for (const stageSolver of PIPELINE) {
    const r = stageSolver(s);
    stages.push(r.stage);
    s = r.state;
  }
  return stages;
}
```

Run: `npm test` → PASS. Commit: `git add -A && git commit -m "feat: solve() pipeline and playback snapshots"`.

- [ ] **Step 12: Wire Solve + Play/Pause + stage label into the app**

Extend `src/App.tsx` (full replacement):

```tsx
import { lazy, Suspense, useCallback, useMemo, useReducer } from 'react';
import { solved, type CubeState } from './core/cube-model/state';
import { apply } from './core/cube-model/apply';
import type { Move } from './core/cube-model/moves';
import { toFacelets } from './core/facelets/facelets';
import { mulberry32 } from './core/scramble/rng';
import { scramble } from './core/scramble/scramble';
import { solve } from './core/solver/solve';
import type { Stage } from './core/solver/types';
import { buildSnapshots } from './core/playback/snapshots';
import { ErrorBoundary } from './view/ErrorBoundary';
import type { Turn } from './view/CubeView';

const CubeView = lazy(() => import('./view/CubeView').then((m) => ({ default: m.CubeView })));

type Phase = 'SOLVED' | 'SCRAMBLING' | 'SCRAMBLED' | 'PLAYING' | 'PAUSED';

interface Solution {
  stages: Stage[];
  moves: Move[];           // flattened
  stageStart: number[];    // first move index of each stage
  snapshots: CubeState[];  // length moves+1
}

interface AppState {
  phase: Phase;
  cube: CubeState;
  scrambleQueue: Move[];
  scrambleIndex: number;
  solution: Solution | null;
  moveIndex: number; // next solution move to play
}

type Action =
  | { type: 'SCRAMBLE'; moves: Move[] }
  | { type: 'SCRAMBLE_TURN_DONE' }
  | { type: 'SOLVE' }
  | { type: 'PLAY' } | { type: 'PAUSE' }
  | { type: 'PLAY_TURN_DONE' };

function buildSolution(cube: CubeState): Solution {
  const stages = solve(cube);
  const moves = stages.flatMap((st) => [...st.moves]);
  const stageStart: number[] = [];
  let acc = 0;
  for (const st of stages) { stageStart.push(acc); acc += st.moves.length; }
  return { stages, moves, stageStart, snapshots: buildSnapshots(cube, moves) };
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'SCRAMBLE':
      return { phase: 'SCRAMBLING', cube: solved(), scrambleQueue: a.moves, scrambleIndex: 0, solution: null, moveIndex: 0 };
    case 'SCRAMBLE_TURN_DONE': {
      const cube = apply(s.cube, s.scrambleQueue[s.scrambleIndex]);
      const next = s.scrambleIndex + 1;
      return next >= s.scrambleQueue.length
        ? { ...s, cube, scrambleIndex: next, phase: 'SCRAMBLED' }
        : { ...s, cube, scrambleIndex: next };
    }
    case 'SOLVE':
      return s.phase === 'SCRAMBLED' ? { ...s, solution: buildSolution(s.cube), moveIndex: 0, phase: 'PAUSED' } : s;
    case 'PLAY':
      return s.solution && s.moveIndex < s.solution.moves.length ? { ...s, phase: 'PLAYING' } : s;
    case 'PAUSE':
      return s.phase === 'PLAYING' ? { ...s, phase: 'PAUSED' } : s;
    case 'PLAY_TURN_DONE': {
      if (!s.solution) return s;
      const next = s.moveIndex + 1;
      const cube = s.solution.snapshots[next];
      if (next >= s.solution.moves.length) return { ...s, cube, moveIndex: next, phase: 'SOLVED' };
      return { ...s, cube, moveIndex: next };
    }
  }
}

const SCRAMBLE_MS = 180;
const PLAY_MS = 300;

export function stageNameAt(sol: Solution, moveIndex: number): string {
  let name = sol.stages[0]?.name ?? '';
  sol.stages.forEach((st, i) => { if (moveIndex >= sol.stageStart[i]) name = st.name; });
  return name;
}

export default function App() {
  const [s, dispatch] = useReducer(reducer, {
    phase: 'SOLVED', cube: solved(), scrambleQueue: [], scrambleIndex: 0, solution: null, moveIndex: 0,
  });
  const facelets = useMemo(() => toFacelets(s.cube), [s.cube]);
  const onScramble = useCallback(() => dispatch({ type: 'SCRAMBLE', moves: scramble(mulberry32(Date.now() >>> 0)) }), []);

  let turn: Turn | null = null;
  if (s.phase === 'SCRAMBLING' && s.scrambleIndex < s.scrambleQueue.length) {
    turn = { move: s.scrambleQueue[s.scrambleIndex], durationMs: SCRAMBLE_MS, onComplete: () => dispatch({ type: 'SCRAMBLE_TURN_DONE' }) };
  } else if (s.phase === 'PLAYING' && s.solution && s.moveIndex < s.solution.moves.length) {
    turn = { move: s.solution.moves[s.moveIndex], durationMs: PLAY_MS, onComplete: () => dispatch({ type: 'PLAY_TURN_DONE' }) };
  }

  const stageName = s.solution ? stageNameAt(s.solution, s.moveIndex) : '';

  return (
    <div data-testid="app" data-phase={s.phase} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <ErrorBoundary>
        <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Loading cube…</div>}>
          <CubeView facelets={facelets} turn={turn} />
        </Suspense>
      </ErrorBoundary>
      {stageName && (
        <div data-testid="stage-label" style={{ position: 'absolute', top: 16, left: 0, right: 0, textAlign: 'center', fontSize: 28, fontWeight: 700 }}>
          {stageName}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button data-testid="scramble" onClick={onScramble} style={{ fontSize: 20, padding: '12px 24px' }}>🔀 Scramble</button>
        <button data-testid="solve" onClick={() => dispatch({ type: 'SOLVE' })} disabled={s.phase !== 'SCRAMBLED'} style={{ fontSize: 20, padding: '12px 24px' }}>🧠 Solve</button>
        {s.phase === 'PLAYING'
          ? <button data-testid="pause" onClick={() => dispatch({ type: 'PAUSE' })} style={{ fontSize: 20, padding: '12px 24px' }}>⏸ Pause</button>
          : <button data-testid="play" onClick={() => dispatch({ type: 'PLAY' })} disabled={!s.solution || s.moveIndex >= (s.solution?.moves.length ?? 0)} style={{ fontSize: 20, padding: '12px 24px' }}>▶ Play</button>}
      </div>
    </div>
  );
}
```

Note: until Task 8 lands, playback ends with only Daisy+Cross solved — the terminal `SOLVED` phase means "playback finished"; full solvedness is guaranteed once the pipeline is complete.

- [ ] **Step 13: Lint + test + manual check** — `npm run lint && npm test` pass; in the browser: Scramble → Solve → Play shows daisy forming then cross, stage label switches Daisy→Cross.

- [ ] **Step 14: Commit**

```bash
git add -A && git commit -m "feat: solve-through-cross playback with stage labels"
```

---

### Task 5: [tdd-workflow] First Layer stage

**Depends on:** Task 4

**Files:**
- Create: `src/core/solver/stages/first-layer.ts`
- Modify: `src/core/solver/solve.ts`
- Test: `src/core/solver/stages/first-layer.test.ts`

- [ ] **Step 1: Write failing test**

`src/core/solver/stages/first-layer.test.ts`:

```ts
import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';
import { solveFirstLayer, firstLayerDone } from './first-layer';

test('first layer + cross intact after stage, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const s1 = solveCross(solveDaisy(start).state).state;
    const { stage, state } = solveFirstLayer(s1);
    expect(firstLayerDone(state)).toBe(true);
    expect(crossDone(state)).toBe(true); // prior stage intact
    expect(applyAll(s1, stage.moves)).toEqual(state);
  }
});
```

- [ ] **Step 2: Run, verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement**

`src/core/solver/stages/first-layer.ts`:

```ts
import type { CubeState } from '../../cube-model/state';
import { Corner } from '../../cube-model/state';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { cornerSlot } from '../recognition';
import { StageCapError, type Stage } from '../types';

export const WHITE_CORNERS = [Corner.DFR, Corner.DLF, Corner.DBL, Corner.DRB] as const;
// Per home slot: the tutorial "righty" conjugate and the U slot directly above it.
const INSERT: Record<number, { alg: string; above: number }> = {
  [Corner.DFR]: { alg: "R U R' U'", above: Corner.URF },
  [Corner.DLF]: { alg: "F U F' U'", above: Corner.UFL },
  [Corner.DBL]: { alg: "L U L' U'", above: Corner.ULB },
  [Corner.DRB]: { alg: "B U B' U'", above: Corner.UBR },
};

function cornerSolved(s: CubeState, cubie: number): boolean {
  return s.cp[cubie] === cubie && s.co[cubie] === 0;
}
export function firstLayerDone(s: CubeState): boolean {
  return WHITE_CORNERS.every((c) => cornerSolved(s, c));
}

export function solveFirstLayer(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, 120, 'First Layer');
  for (const cubie of WHITE_CORNERS) {
    if (cornerSolved(e.state, cubie)) continue;
    // Eject if stuck in any D slot (wrong slot, or home slot but twisted)
    const slot = cornerSlot(e.state, cubie);
    if (slot >= 4 && !cornerSolved(e.state, cubie)) e.do(INSERT[slot].alg);
    // Repeat tutorial righty trials until inserted white-down
    const { alg, above } = INSERT[cubie];
    for (let i = 0; i < 14 && !cornerSolved(e.state, cubie); i++) {
      const cur = cornerSlot(e.state, cubie);
      if (cur === cubie) { e.do(alg); continue; } // home slot but twisted: run the alg again
      rotateUUntil(e, (s) => cornerSlot(s, cubie) === above);
      e.do(alg);
    }
    if (!cornerSolved(e.state, cubie)) throw new StageCapError('First Layer', `corner ${cubie} did not insert`);
  }
  return { stage: { name: 'First Layer', moves: cleanup(e.moves) }, state: e.state };
}
```

In `src/core/solver/solve.ts`, add `solveFirstLayer` to the pipeline:

```ts
import { solveFirstLayer } from './stages/first-layer';
const PIPELINE: StageSolver[] = [solveDaisy, solveCross, solveFirstLayer];
```

- [ ] **Step 4: Run, verify pass** — `npm test` → PASS. (If insertion loops exhaust: the righty conjugate for a slot is wrong — verify each alg extracts/inserts its own slot's corner by unit-stepping with `applyAll`.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: first-layer corner stage via tutorial righty trials"
```

---

### Task 6: [tdd-workflow] Second Layer stage

**Depends on:** Task 5

**Files:**
- Create: `src/core/solver/stages/second-layer.ts`
- Modify: `src/core/solver/solve.ts`
- Test: `src/core/solver/stages/second-layer.test.ts`

- [ ] **Step 1: Write failing test** (same shape as Task 5; invariant: 4 middle edges home and unflipped, first layer + cross intact, 300 scrambles)

```ts
import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';
import { solveFirstLayer, firstLayerDone } from './first-layer';
import { solveSecondLayer, secondLayerDone } from './second-layer';

test('second layer done, first layer intact, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const s2 = solveFirstLayer(solveCross(solveDaisy(start).state).state).state;
    const { stage, state } = solveSecondLayer(s2);
    expect(secondLayerDone(state)).toBe(true);
    expect(firstLayerDone(state) && crossDone(state)).toBe(true);
    expect(applyAll(s2, stage.moves)).toEqual(state);
  }
});
```

- [ ] **Step 2: Run, verify failure** — FAIL.

- [ ] **Step 3: Implement**

`src/core/solver/stages/second-layer.ts`:

```ts
import type { CubeState } from '../../cube-model/state';
import { Edge } from '../../cube-model/state';
import type { Face } from '../../cube-model/moves';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { edgeSlot, edgeSticker } from '../recognition';
import { StageCapError, type Stage } from '../types';
import { U_SLOT_OF_FACE } from './daisy';

export const MIDDLE_EDGES = [Edge.FR, Edge.FL, Edge.BL, Edge.BR] as const;

// Standard tutorial inserts. rightInsert(f, r): edge parked at U-slot-of-f showing its
// f-color on f; inserts into slot f∩r. leftInsert(f, l) mirrors it.
const right = (f: Face, r: Face) => `U ${r} U' ${r}' U' ${f}' U ${f}`;
const left = (f: Face, l: Face) => `U' ${l}' U ${l} U ${f} U' ${f}'`;
// Per slot: two cases keyed by WHICH face the side sticker must align with.
const CASES: Record<number, Array<{ alignFace: Face; alg: string }>> = {
  [Edge.FR]: [{ alignFace: 'F', alg: right('F', 'R') }, { alignFace: 'R', alg: left('R', 'F') }],
  [Edge.FL]: [{ alignFace: 'F', alg: left('F', 'L') }, { alignFace: 'L', alg: right('L', 'F') }],
  [Edge.BL]: [{ alignFace: 'B', alg: right('B', 'L') }, { alignFace: 'L', alg: left('L', 'B') }],
  [Edge.BR]: [{ alignFace: 'B', alg: left('B', 'R') }, { alignFace: 'R', alg: right('R', 'B') }],
};

function edgeHome(s: CubeState, cubie: number): boolean {
  return s.ep[cubie] === cubie && s.eo[cubie] === 0;
}
export function secondLayerDone(s: CubeState): boolean {
  return MIDDLE_EDGES.every((c) => edgeHome(s, c));
}
/** Side-facing color of a U-layer edge (the sticker NOT facing up). */
function sideColor(s: CubeState, slot: number): Face {
  const sideFace = ['R', 'F', 'L', 'B'][slot] as Face; // slots UR,UF,UL,UB
  return edgeSticker(s, slot, sideFace)! as Face;
}

export function solveSecondLayer(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, 160, 'Second Layer');
  for (let guard = 0; guard < 12 && !secondLayerDone(e.state); guard++) {
    const cubie = MIDDLE_EDGES.find((c) => !edgeHome(e.state, c))!;
    let slot = edgeSlot(e.state, cubie);
    if (slot >= 8) {
      // Stuck in the E layer (wrong slot or flipped): eject by running that slot's first
      // case alg after parking a non-middle edge at its park slot.
      const c0 = CASES[slot][0];
      const park = U_SLOT_OF_FACE[c0.alignFace]!;
      rotateUUntil(e, (s) => !(MIDDLE_EDGES as readonly number[]).includes(s.ep[park]));
      e.do(c0.alg);
      slot = edgeSlot(e.state, cubie); // now in the U layer
    }
    // U layer: park so the side sticker aligns with its center, then insert.
    const align = sideColor(e.state, slot); // constant under U turns
    rotateUUntil(e, (s) => edgeSlot(s, cubie) === U_SLOT_OF_FACE[align]);
    const targetCase = CASES[cubie].find((c) => c.alignFace === align);
    if (!targetCase) throw new StageCapError('Second Layer', `edge ${cubie} has no case for align face ${align}`);
    e.do(targetCase.alg);
  }
  if (!secondLayerDone(e.state)) throw new StageCapError('Second Layer', 'did not converge');
  return { stage: { name: 'Second Layer', moves: cleanup(e.moves) }, state: e.state };
}
```

Add `solveSecondLayer` to the pipeline in `solve.ts`.

- [ ] **Step 4: Run, verify pass** — `npm test` → PASS. (Likeliest failure: an insert alg variant has the wrong leading-U direction — verify a single case headless: build a state with one middle edge parked correctly, run the alg, assert `edgeHome`. Fix the template, not the test.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: second-layer edge stage via tutorial left/right inserts"
```

---

### Task 7: [tdd-workflow] OLL stage (2-look)

**Depends on:** Task 6

**Files:**
- Create: `src/core/solver/stages/oll.ts`
- Modify: `src/core/solver/solve.ts`
- Test: `src/core/solver/stages/oll.test.ts`

- [ ] **Step 1: Write failing test** (invariant: all last-layer stickers facing up are yellow, i.e. every U-slot edge/corner shows `U` color on the U face; prior stages intact; 300 scrambles)

```ts
import { expect, test } from 'vitest';
import { solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross, crossDone } from './cross';
import { solveFirstLayer, firstLayerDone } from './first-layer';
import { solveSecondLayer, secondLayerDone } from './second-layer';
import { solveOll, ollDone } from './oll';

test('OLL done, lower layers intact, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const s3 = solveSecondLayer(solveFirstLayer(solveCross(solveDaisy(start).state).state).state).state;
    const { stage, state } = solveOll(s3);
    expect(ollDone(state)).toBe(true);
    expect(secondLayerDone(state) && firstLayerDone(state) && crossDone(state)).toBe(true);
    expect(applyAll(s3, stage.moves)).toEqual(state);
  }
});
```

- [ ] **Step 2: Run, verify failure** — FAIL.

- [ ] **Step 3: Implement**

`src/core/solver/stages/oll.ts`:

```ts
import type { CubeState } from '../../cube-model/state';
import { Corner, Edge } from '../../cube-model/state';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { cornerSticker, edgeSticker } from '../recognition';
import { StageCapError, type Stage } from '../types';

const U_EDGE_SLOTS = [Edge.UR, Edge.UF, Edge.UL, Edge.UB] as const;
const U_CORNER_SLOTS = [Corner.URF, Corner.UFL, Corner.ULB, Corner.UBR] as const;

const edgeUp = (s: CubeState, slot: number) => edgeSticker(s, slot, 'U') === 'U';
const cornerUp = (s: CubeState, slot: number) => cornerSticker(s, slot, 'U') === 'U';

export function ollDone(s: CubeState): boolean {
  return U_EDGE_SLOTS.every((sl) => edgeUp(s, sl)) && U_CORNER_SLOTS.every((sl) => cornerUp(s, sl));
}

export function solveOll(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, 120, 'OLL');

  // Look 1: edges (dot → L → line → cross)
  for (let guard = 0; guard < 6 && !U_EDGE_SLOTS.every((sl) => edgeUp(e.state, sl)); guard++) {
    const count = U_EDGE_SLOTS.filter((sl) => edgeUp(e.state, sl)).length;
    if (count === 0) {
      e.do("F R U R' U' F'"); // dot → line/L
    } else if (count === 2) {
      const opposite = (s: CubeState) =>
        (edgeUp(s, Edge.UR) && edgeUp(s, Edge.UL)) || (edgeUp(s, Edge.UF) && edgeUp(s, Edge.UB));
      if (opposite(e.state)) {
        rotateUUntil(e, (s) => edgeUp(s, Edge.UR) && edgeUp(s, Edge.UL)); // line horizontal
        e.do("F R U R' U' F'");
      } else {
        rotateUUntil(e, (s) => edgeUp(s, Edge.UB) && edgeUp(s, Edge.UL)); // L at 9 and 12 o'clock
        e.do("F U R U' R' F'");
      }
    } else {
      throw new StageCapError('OLL', `impossible oriented-edge count ${count}`);
    }
  }

  // Look 2: corners via Sune, standard 2-look positioning rules
  const SUNE = "R U R' U R U2 R'";
  for (let guard = 0; guard < 8 && !U_CORNER_SLOTS.every((sl) => cornerUp(e.state, sl)); guard++) {
    const count = U_CORNER_SLOTS.filter((sl) => cornerUp(e.state, sl)).length;
    if (count === 1) {
      rotateUUntil(e, (s) => cornerUp(s, Corner.UFL)); // oriented corner at front-left
    } else if (count === 0) {
      rotateUUntil(e, (s) => cornerSticker(s, Corner.UFL, 'L') === 'U'); // yellow facing left at front-left
    } else { // count === 2
      rotateUUntil(e, (s) => cornerSticker(s, Corner.UFL, 'F') === 'U'); // yellow facing front at front-left
    }
    e.do(SUNE);
  }
  if (!ollDone(e.state)) throw new StageCapError('OLL', 'did not converge');
  return { stage: { name: 'OLL', moves: cleanup(e.moves) }, state: e.state };
}
```

Add `solveOll` to the pipeline.

- [ ] **Step 4: Run, verify pass** — `npm test` → PASS. (If the corner loop fails to converge: the Sune positioning anchor differs between tutorials — try anchoring rules at `URF` instead of `UFL`. The edge rules are unambiguous.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 2-look OLL stage (edge cross + Sune corners)"
```

---

### Task 8: [tdd-workflow] PLL stage (2-look) + the 10k correctness gate

**Depends on:** Task 7

**Files:**
- Create: `src/core/solver/stages/pll.ts`, `src/core/solver/solve.gate.test.ts`, `src/core/index.ts`
- Modify: `src/core/solver/solve.ts`
- Test: `src/core/solver/stages/pll.test.ts`

- [ ] **Step 1: Write failing tests**

`src/core/solver/stages/pll.test.ts`:

```ts
import { expect, test } from 'vitest';
import { isSolved, solved } from '../../cube-model/state';
import { applyAll } from '../../cube-model/apply';
import { mulberry32 } from '../../scramble/rng';
import { scramble } from '../../scramble/scramble';
import { solveDaisy } from './daisy';
import { solveCross } from './cross';
import { solveFirstLayer } from './first-layer';
import { solveSecondLayer } from './second-layer';
import { solveOll } from './oll';
import { solvePll } from './pll';

test('PLL fully solves the cube, across 300 random scrambles', () => {
  for (let seed = 0; seed < 300; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const s4 = solveOll(solveSecondLayer(solveFirstLayer(solveCross(solveDaisy(start).state).state).state).state).state;
    const { stage, state } = solvePll(s4);
    expect(isSolved(state)).toBe(true);
    expect(applyAll(s4, stage.moves)).toEqual(state);
  }
});
```

`src/core/solver/solve.gate.test.ts` — THE correctness gate (ADR 0001):

```ts
import { expect, test } from 'vitest';
import { isSolved, solved } from '../cube-model/state';
import { applyAll } from '../cube-model/apply';
import { mulberry32 } from '../scramble/rng';
import { scramble } from '../scramble/scramble';
import { solve } from './solve';
import { STAGE_NAMES } from './types';

test('10,000 random scrambles all solve to the solved state', () => {
  for (let seed = 0; seed < 10_000; seed++) {
    const start = applyAll(solved(), scramble(mulberry32(seed)));
    const stages = solve(start);
    expect(stages.map((s) => s.name)).toEqual(STAGE_NAMES);
    const end = applyAll(start, stages.flatMap((s) => [...s.moves]));
    expect(isSolved(end)).toBe(true);
  }
}, 120_000);
```

- [ ] **Step 2: Run, verify failure** — FAIL.

- [ ] **Step 3: Implement PLL**

`src/core/solver/stages/pll.ts`:

```ts
import type { CubeState } from '../../cube-model/state';
import { Corner, Edge, isSolved } from '../../cube-model/state';
import type { Face } from '../../cube-model/moves';
import { applyAll } from '../../cube-model/apply';
import { parse } from '../../notation/notation';
import { Emitter, rotateUUntil } from '../emitter';
import { cleanup } from '../cleanup';
import { cornerSticker } from '../recognition';
import { StageCapError, type Stage } from '../types';

const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'"; // swaps the two RIGHT corners (URF↔UBR) + UL↔UR... headlights go LEFT
const U_PERM_A = "R U' R U R U R U' R' U' R2"; // 3-cycle of UF/UL/UR family, UB fixed
const U_PERM_B = "R2 U R U R' U' R' U' R' U R'"; // the opposite 3-cycle, UB fixed

const U_CORNER_SLOTS = [Corner.URF, Corner.UFL, Corner.ULB, Corner.UBR] as const;
const U_EDGE_SLOTS = [Edge.UR, Edge.UF, Edge.UL, Edge.UB] as const;
// Left & right U-corner slots seen when facing each side
const FACE_CORNERS: Record<string, [number, number]> = {
  F: [Corner.UFL, Corner.URF], R: [Corner.URF, Corner.UBR],
  B: [Corner.UBR, Corner.ULB], L: [Corner.ULB, Corner.UFL],
};

function headlightsOn(s: CubeState, f: Face): boolean {
  const [a, b] = FACE_CORNERS[f];
  return cornerSticker(s, a, f) === cornerSticker(s, b, f);
}
function cornersHome(s: CubeState): boolean {
  return U_CORNER_SLOTS.every((sl) => s.cp[sl] === sl && s.co[sl] === 0);
}
function cornersPermutedUpToU(s: CubeState): boolean {
  let t = s;
  for (let k = 0; k < 4; k++) {
    if (cornersHome(t)) return true;
    t = applyAll(t, parse('U'));
  }
  return false;
}
// Number of U turns that carries the edge in `from` to slot UB (U sends UB→UR→UF→UL→UB)
const U_ORDER = [Edge.UB, Edge.UR, Edge.UF, Edge.UL];
function uTurnsToUB(from: number): number {
  return (4 - U_ORDER.indexOf(from)) % 4;
}

export function solvePll(state: CubeState): { stage: Stage; state: CubeState } {
  const e = new Emitter(state, 160, 'PLL');

  // Look 1: permute corners — headlights to the LEFT, T-perm swaps the right pair
  for (let guard = 0; guard < 4 && !cornersPermutedUpToU(e.state); guard++) {
    const anyHeadlights = (['F', 'R', 'B', 'L'] as Face[]).some((f) => headlightsOn(e.state, f));
    if (anyHeadlights) rotateUUntil(e, (s) => headlightsOn(s, 'L'));
    e.do(T_PERM); // no headlights: one T-perm creates them
  }
  if (!cornersPermutedUpToU(e.state)) throw new StageCapError('PLL', 'corner permutation did not converge');

  // Align corners home (also serves as AUF as edges finish)
  rotateUUntil(e, cornersHome);

  // Look 2: cycle edges with U-perms (corners stay fixed)
  for (let guard = 0; guard < 6 && !isSolved(e.state); guard++) {
    const home = U_EDGE_SLOTS.filter((sl) => e.state.ep[sl] === sl);
    if (home.length === 4) break;
    if (home.length === 0) { e.do(U_PERM_A); continue; } // H/Z case: one U-perm leaves a 3-cycle
    // exactly one home edge: bring it to UB, pick cycle direction by simulation, restore
    const j = uTurnsToUB(home[0]);
    if (j > 0) e.do(Array(j).fill('U').join(' '));
    const tryA = applyAll(e.state, parse(U_PERM_A));
    const aFixes = U_EDGE_SLOTS.filter((sl) => {
      let t = tryA;
      for (let k = 0; k < 4; k++) { if (cornersHome(t) && t.ep[sl] === sl) return true; t = applyAll(t, parse('U')); }
      return false;
    }).length;
    e.do(aFixes === 4 ? U_PERM_A : U_PERM_B);
    rotateUUntil(e, cornersHome); // realign / AUF
  }
  if (!isSolved(e.state)) throw new StageCapError('PLL', 'did not converge');
  return { stage: { name: 'PLL', moves: cleanup(e.moves) }, state: e.state };
}
```

Add `solvePll` to the pipeline in `solve.ts`. Create `src/core/index.ts`:

```ts
export { solved, isSolved, Corner, Edge, type CubeState } from './cube-model/state';
export { apply, applyAll } from './cube-model/apply';
export { move, inverse, type Move, type Face, type Turns } from './cube-model/moves';
export { parse, format } from './notation/notation';
export { mulberry32, type Rng } from './scramble/rng';
export { scramble } from './scramble/scramble';
export { assertSolvable, UnsolvableCubeError } from './validate/validate';
export { toFacelets, type FaceName } from './facelets/facelets';
export { solve } from './solver/solve';
export { STAGE_NAMES, StageCapError, type Stage, type StageName } from './solver/types';
export { buildSnapshots } from './playback/snapshots';
```

- [ ] **Step 4: JSDoc the public API** — [coding-standards] every function re-exported through `src/core/index.ts` (`apply`, `applyAll`, `move`, `inverse`, `parse`, `format`, `scramble`, `assertSolvable`, `toFacelets`, `solve`, `buildSnapshots`) gets JSDoc on its definition with `@param`/`@returns`, plus `@throws` where applicable (`UnsolvableCubeError` on `assertSolvable`/`solve`, `StageCapError` on `solve`, `Error` on `parse`). Run `npm run lint` after.

- [ ] **Step 5: Run, verify pass** — `npm test` → all PASS including the 10k gate. (T-perm/U-perm transcription errors show up here instantly: verify each alg in isolation — apply to solved, assert the documented swap/cycle and nothing else outside the U layer. The direction-by-simulation step makes Ua/Ub choice self-correcting.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 2-look PLL stage — full solver passes 10k-scramble gate"
```

---

### Task 9: [frontend-patterns] Full playback controls — step, scrub, stage jump, speed

**Depends on:** Task 8

**Files:**
- Create: `src/view/ControlPanel.tsx`
- Modify: `src/App.tsx`, `src/view/CubeView.tsx` (reset-view support)
- Test: manual + existing suites (`npm run lint && npm test`)

- [ ] **Step 1: Add reducer actions for seek/step/speed**

In `src/App.tsx`, extend `Action` and `reducer`:

```tsx
type Action =
  | { type: 'SCRAMBLE'; moves: Move[] }
  | { type: 'SCRAMBLE_TURN_DONE' }
  | { type: 'SOLVE' }
  | { type: 'PLAY' } | { type: 'PAUSE' }
  | { type: 'PLAY_TURN_DONE' }
  | { type: 'SEEK'; index: number }       // scrub / stage jump / step — snaps via snapshot
  | { type: 'SET_SPEED'; speed: number }; // 0.5 | 1 | 2

// in AppState add: speed: number  (init 1)

// in reducer add:
    case 'SEEK': {
      if (!s.solution) return s;
      const index = Math.max(0, Math.min(a.index, s.solution.moves.length));
      // cancel any in-flight turn by snapping phase to PAUSED; cube snaps to the snapshot
      const phase: Phase = index >= s.solution.moves.length ? 'SOLVED' : 'PAUSED';
      return { ...s, cube: s.solution.snapshots[index], moveIndex: index, phase };
    }
    case 'SET_SPEED':
      return { ...s, speed: a.speed };
```

Playback turn duration becomes `PLAY_MS / s.speed`.

Step forward = `SEEK(moveIndex + 1)`; step back = `SEEK(moveIndex - 1)` (snapshot snap — the design's "play reverse turn visually" is the PLAYING-direction nicety; stepping while paused snaps, which is instant and glitch-free). Stage jump = `SEEK(stageStart[i])`.

- [ ] **Step 2: Build the control panel**

`src/view/ControlPanel.tsx`:

```tsx
import type { Stage } from '../core/solver/types';
import { format } from '../core/notation/notation';

const STAGE_COLORS = ['#f6e58d', '#ffbe76', '#ff7979', '#badc58', '#7ed6df', '#e056fd'];

export interface ControlPanelProps {
  phase: string;
  stages: Stage[] | null;
  stageStart: number[];
  moveIndex: number;
  totalMoves: number;
  speed: number;
  currentMove: string; // formatted notation of the move about to play, '' at end
  onScramble: () => void;
  onSolve: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onSpeed: (speed: number) => void;
}

export function ControlPanel(p: ControlPanelProps) {
  const haveSolution = p.stages !== null && p.totalMoves > 0;
  const stageIndexAt = (mi: number) => {
    let idx = 0;
    p.stageStart.forEach((s, i) => { if (mi >= s) idx = i; });
    return idx;
  };
  const curStage = haveSolution ? stageIndexAt(p.moveIndex) : -1;
  const btn: React.CSSProperties = { fontSize: 18, padding: '10px 16px' };

  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      {haveSolution && (
        <>
          <div style={{ display: 'flex', gap: 8, fontSize: 22, fontWeight: 700, alignItems: 'baseline' }}>
            <span data-testid="stage-name">{p.stages![curStage].name}</span>
            <span data-testid="current-move" style={{ fontFamily: 'monospace', fontSize: 26 }}>{p.currentMove}</span>
            <span style={{ fontSize: 14, fontWeight: 400 }}>{p.moveIndex}/{p.totalMoves}</span>
          </div>
          {/* Segmented timeline: one colored band per stage; click a band to jump */}
          <div style={{ display: 'flex', width: 'min(640px, 90vw)', height: 14, borderRadius: 7, overflow: 'hidden', cursor: 'pointer' }}>
            {p.stages!.map((st, i) => (
              <div
                key={st.name}
                data-testid={`stage-seg-${i}`}
                title={st.name}
                onClick={() => p.onSeek(p.stageStart[i])}
                style={{
                  flex: Math.max(st.moves.length, 1),
                  background: STAGE_COLORS[i],
                  opacity: i === curStage ? 1 : 0.45,
                }}
              />
            ))}
          </div>
          <input
            data-testid="scrub" type="range" min={0} max={p.totalMoves} value={p.moveIndex}
            onChange={(ev) => p.onSeek(Number(ev.target.value))}
            style={{ width: 'min(640px, 90vw)' }}
          />
        </>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button data-testid="scramble" style={btn} onClick={p.onScramble}>🔀 Scramble</button>
        <button data-testid="solve" style={btn} onClick={p.onSolve} disabled={p.phase !== 'SCRAMBLED'}>🧠 Solve</button>
        <button data-testid="prev-stage" style={btn} disabled={!haveSolution} onClick={() => p.onSeek(p.stageStart[Math.max(curStage - (p.moveIndex === p.stageStart[curStage] ? 1 : 0), 0)])}>⏮</button>
        <button data-testid="step-back" style={btn} disabled={!haveSolution || p.moveIndex === 0} onClick={() => p.onSeek(p.moveIndex - 1)}>◀</button>
        {p.phase === 'PLAYING'
          ? <button data-testid="pause" style={{ ...btn, fontSize: 22 }} onClick={p.onPause}>⏸</button>
          : <button data-testid="play" style={{ ...btn, fontSize: 22 }} disabled={!haveSolution || p.moveIndex >= p.totalMoves} onClick={p.onPlay}>▶</button>}
        <button data-testid="step-fwd" style={btn} disabled={!haveSolution || p.moveIndex >= p.totalMoves} onClick={() => p.onSeek(p.moveIndex + 1)}>▶︎</button>
        <button data-testid="next-stage" style={btn} disabled={!haveSolution || curStage >= 5} onClick={() => p.onSeek(p.stageStart[Math.min(curStage + 1, 5)])}>⏭</button>
        <select data-testid="speed" value={p.speed} onChange={(ev) => p.onSpeed(Number(ev.target.value))} style={btn}>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </div>
    </div>
  );
}
```

Wire it in `App.tsx` (replacing the inline buttons), passing `currentMove = s.solution && s.moveIndex < s.solution.moves.length ? format([s.solution.moves[s.moveIndex]]) : ''` and `data-solved={isSolved(s.cube)}` on the root div.

- [ ] **Step 3: Reset View button**

In `CubeView.tsx`, capture the controls and expose reset; add a small overlay button:

```tsx
import { useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
// inside CubeView:
const controls = useRef<OrbitControlsImpl>(null);
// <OrbitControls ref={controls} ... />
// Outside the Canvas (CubeView renders a wrapper div):
<button
  data-testid="reset-view"
  style={{ position: 'absolute', top: 12, right: 12, fontSize: 16, padding: '8px 12px' }}
  onClick={() => controls.current?.reset()}
>
  🎯 Reset view
</button>
```

(`controls.reset()` restores the saved initial camera; drei saves it on mount. Double-click handler optional: add `onDoubleClick` on the wrapper div calling the same reset.)

- [ ] **Step 3b: Keyboard support + aria-labels** — [frontend-patterns]

In `App.tsx`, add a window keydown handler (Space = play/pause, ArrowRight/ArrowLeft = step, ignored while focus is on a form control):

```tsx
useEffect(() => {
  const onKey = (ev: KeyboardEvent) => {
    if (ev.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target.tagName)) return;
    if (ev.code === 'Space') { ev.preventDefault(); dispatch({ type: s.phase === 'PLAYING' ? 'PAUSE' : 'PLAY' }); }
    if (ev.code === 'ArrowRight') dispatch({ type: 'SEEK', index: s.moveIndex + 1 });
    if (ev.code === 'ArrowLeft') dispatch({ type: 'SEEK', index: s.moveIndex - 1 });
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [s.phase, s.moveIndex]);
```

(add `useEffect` to the React import). In `ControlPanel.tsx`, give every icon-only button an `aria-label`: ⏮ "Jump to previous stage", ◀ "Step back", ▶ "Play", ⏸ "Pause", ▶︎ "Step forward", ⏭ "Jump to next stage", and the speed select `aria-label="Playback speed"`.

- [ ] **Step 4: Lint + tests + manual check**

`npm run lint && npm test` → PASS. Manual: scramble → solve → play; pause mid-stage; step both directions; yank the scrubber rapidly during playback (no glitches, instant snaps); click each timeline segment (jumps to stage start, label updates); change speed mid-play; reset view after orbiting. Full playback ends with `data-solved="true"` and a solved-looking cube.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: full playback controls — step, scrub timeline, stage jump, speed, reset view"
```

---

### Task 10: [tdd-workflow] E2E journey

**Depends on:** Task 9

**Files:**
- Create: `playwright.config.ts`, `e2e/journey.spec.ts`
- Modify: `package.json` (script `"e2e": "playwright test"`)

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
```

- [ ] **Step 2: Write the journey test**

`e2e/journey.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('scramble → solve → play to completion → cube is solved', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await expect(app).toHaveAttribute('data-phase', 'SOLVED');

  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-solved', 'false');

  await page.getByTestId('solve').click();
  await page.getByTestId('speed').selectOption('2');
  await page.getByTestId('play').click();
  await expect(app).toHaveAttribute('data-phase', 'PLAYING');
  await expect(app).toHaveAttribute('data-phase', 'SOLVED', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-solved', 'true');
});

test('scramble is always available and hard-resets mid-playback', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();
  await page.getByTestId('play').click();
  await page.getByTestId('scramble').click(); // mid-playback reset
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', /SCRAMBLING|SCRAMBLED/, { timeout: 30_000 });
});
```

- [ ] **Step 3: Run** — `npm run e2e` → both tests PASS.

- [ ] **Step 4: Commit + push**

```bash
git add -A && git commit -m "test: e2e journey — scramble, solve, playback to solved"
git push
```

---

## Self-review checklist (run after writing, fixed inline)

- Spec coverage: walking skeleton (Task 1), engine+tables (2), scramble+seeded RNG (3), validate+daisy+cross+snapshots+state machine (4), first/second layer (5/6), 2-look OLL/PLL + 10k gate (7/8), full controls+camera reset (9), e2e (10). Stage-boundary cleanup in every stage solver. Empty-stage emission handled by pipeline (stages always 6).
- Known intentional deviation: step-back while paused snaps via snapshot instead of animating the reverse turn — visually instant, simpler, and scrub-equivalent; the design's reverse-turn animation applies to the PLAYING flow. Revisit only if stepping feels wrong in manual testing.
- Solver alg variants (second-layer insert leading-U direction, Sune anchor, T-perm headlight side, Ua/Ub direction) are the known risk points; each task names its check and the fix location. The Ua/Ub choice is self-correcting by simulation.

---
**Skills applied (plan-polish):** coding-standards, tdd-workflow, frontend-patterns
**Hard conflicts resolved:** 1 — `null as unknown as Move` cast in `cleanup()` replaced with `Move | undefined` (user ruling: follow skill).
**Soft conflicts noted (not applied, with reasons):**
- tdd-workflow wanted the Playwright skeleton scaffolded before Task 3 — kept at Task 10: the journey test needs the full solver, and the unit/property suites already provide red-green cycles from Task 1.
- frontend-patterns wanted a compound-component ControlPanel and a `useTurnAnimation` hook extraction — kept the simpler shapes per YAGNI; revisit only if the panel or animator grows.
- tdd-workflow wanted an explicit refactor sub-step in every task — covered instead by the global constraint note (refactor while green before each commit).
