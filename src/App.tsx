import { lazy, Suspense, useCallback, useMemo, useReducer, type CSSProperties } from 'react';
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

const SCRAMBLE_MS = 180;
const PLAY_MS = 300;

type Phase = 'SOLVED' | 'SCRAMBLING' | 'SCRAMBLED' | 'PLAYING' | 'PAUSED';

interface Solution {
  readonly stages: readonly Stage[];
  readonly moves: readonly Move[]; // flattened
  readonly stageStart: readonly number[]; // first move index of each stage
  readonly snapshots: readonly CubeState[]; // length moves+1
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
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'PLAY_TURN_DONE' };

function buildSolution(cube: CubeState): Solution {
  const stages = solve(cube);
  const moves = stages.flatMap((st) => [...st.moves]);
  const stageStart: number[] = [];
  let acc = 0;
  for (const st of stages) {
    stageStart.push(acc);
    acc += st.moves.length;
  }
  return { stages, moves, stageStart, snapshots: buildSnapshots(cube, moves) };
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'SCRAMBLE':
      return {
        phase: a.moves.length === 0 ? 'SCRAMBLED' : 'SCRAMBLING',
        cube: solved(),
        scrambleQueue: a.moves,
        scrambleIndex: 0,
        solution: null,
        moveIndex: 0,
      };
    case 'SCRAMBLE_TURN_DONE': {
      const cube = apply(s.cube, s.scrambleQueue[s.scrambleIndex]);
      const next = s.scrambleIndex + 1;
      return next >= s.scrambleQueue.length
        ? { ...s, cube, scrambleIndex: next, phase: 'SCRAMBLED' }
        : { ...s, cube, scrambleIndex: next };
    }
    case 'SOLVE':
      return s.phase === 'SCRAMBLED'
        ? { ...s, solution: buildSolution(s.cube), moveIndex: 0, phase: 'PAUSED' }
        : s;
    case 'PLAY':
      return s.solution && s.moveIndex < s.solution.moves.length
        ? { ...s, phase: 'PLAYING' }
        : s;
    case 'PAUSE':
      return s.phase === 'PLAYING' ? { ...s, phase: 'PAUSED' } : s;
    case 'PLAY_TURN_DONE': {
      if (!s.solution) return s;
      const next = s.moveIndex + 1;
      const cube = s.solution.snapshots[next];
      if (next >= s.solution.moves.length) {
        return { ...s, cube, moveIndex: next, phase: 'SOLVED' };
      }
      return { ...s, cube, moveIndex: next };
    }
  }
}

const INITIAL_STATE: AppState = {
  phase: 'SOLVED',
  cube: solved(),
  scrambleQueue: [],
  scrambleIndex: 0,
  solution: null,
  moveIndex: 0,
};

function stageNameAt(sol: Solution, moveIndex: number): string {
  let name: string = sol.stages[0]?.name ?? '';
  sol.stages.forEach((st, i) => {
    if (moveIndex >= sol.stageStart[i]) name = st.name;
  });
  return name;
}

const APP_STYLE: CSSProperties = {
  width: '100vw',
  height: '100vh',
  position: 'relative',
};
const FALLBACK_STYLE: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  height: '100%',
};
const STAGE_LABEL_STYLE: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 28,
  fontWeight: 700,
};
const CONTROLS_STYLE: CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  gap: 12,
};
const BUTTON_STYLE: CSSProperties = {
  fontSize: 20,
  padding: '12px 24px',
};

export default function App() {
  const [s, dispatch] = useReducer(reducer, INITIAL_STATE);
  const facelets = useMemo(() => toFacelets(s.cube), [s.cube]);

  const onScramble = useCallback(
    () => dispatch({ type: 'SCRAMBLE', moves: scramble(mulberry32(Date.now() >>> 0)) }),
    [],
  );
  const onSolve = useCallback(() => dispatch({ type: 'SOLVE' }), []);
  const onPlay = useCallback(() => dispatch({ type: 'PLAY' }), []);
  const onPause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const onScrambleTurnDone = useCallback(() => dispatch({ type: 'SCRAMBLE_TURN_DONE' }), []);
  const onPlayTurnDone = useCallback(() => dispatch({ type: 'PLAY_TURN_DONE' }), []);

  let turn: Turn | null = null;
  if (s.phase === 'SCRAMBLING' && s.scrambleIndex < s.scrambleQueue.length) {
    turn = {
      move: s.scrambleQueue[s.scrambleIndex],
      durationMs: SCRAMBLE_MS,
      onComplete: onScrambleTurnDone,
    };
  } else if (s.phase === 'PLAYING' && s.solution && s.moveIndex < s.solution.moves.length) {
    turn = {
      move: s.solution.moves[s.moveIndex],
      durationMs: PLAY_MS,
      onComplete: onPlayTurnDone,
    };
  }

  const stageName = s.solution ? stageNameAt(s.solution, s.moveIndex) : '';
  const playDisabled =
    !s.solution || s.moveIndex >= (s.solution?.moves.length ?? 0);

  return (
    <div data-testid="app" data-phase={s.phase} style={APP_STYLE}>
      <ErrorBoundary>
        <Suspense fallback={<div style={FALLBACK_STYLE}>Loading cube…</div>}>
          <CubeView facelets={facelets} turn={turn} />
        </Suspense>
      </ErrorBoundary>
      {stageName && (
        <div data-testid="stage-label" style={STAGE_LABEL_STYLE}>
          {stageName}
        </div>
      )}
      <div style={CONTROLS_STYLE}>
        <button data-testid="scramble" onClick={onScramble} style={BUTTON_STYLE}>
          🔀 Scramble
        </button>
        <button
          data-testid="solve"
          onClick={onSolve}
          disabled={s.phase !== 'SCRAMBLED'}
          style={BUTTON_STYLE}
        >
          🧠 Solve
        </button>
        {s.phase === 'PLAYING' ? (
          <button data-testid="pause" onClick={onPause} style={BUTTON_STYLE}>
            ⏸ Pause
          </button>
        ) : (
          <button
            data-testid="play"
            onClick={onPlay}
            disabled={playDisabled}
            style={BUTTON_STYLE}
          >
            ▶ Play
          </button>
        )}
      </div>
    </div>
  );
}
