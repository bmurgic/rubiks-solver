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

const SCRAMBLE_MS = 180;
const SEED_MASK = 0xffffffff;

type Phase = 'SOLVED' | 'SCRAMBLING' | 'SCRAMBLED' | 'PLAYING' | 'PAUSED';

interface AppState {
  phase: Phase;
  cube: CubeState;
  queue: Move[]; // moves still to animate (scramble for now; playback later)
  queueIndex: number;
}

type Action = { type: 'SCRAMBLE'; moves: Move[] } | { type: 'TURN_DONE' };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'SCRAMBLE':
      return { phase: 'SCRAMBLING', cube: solved(), queue: a.moves, queueIndex: 0 };
    case 'TURN_DONE': {
      const cube = apply(s.cube, s.queue[s.queueIndex]);
      const next = s.queueIndex + 1;
      if (next >= s.queue.length) {
        return { ...s, cube, queueIndex: next, phase: 'SCRAMBLED' };
      }
      return { ...s, cube, queueIndex: next };
    }
  }
}

const INITIAL_STATE: AppState = {
  phase: 'SOLVED',
  cube: solved(),
  queue: [],
  queueIndex: 0,
};

const APP_STYLE: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  position: 'relative',
};
const FALLBACK_STYLE: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  height: '100%',
};
const CONTROLS_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  gap: 12,
};
const SCRAMBLE_BUTTON_STYLE: React.CSSProperties = {
  fontSize: 20,
  padding: '12px 24px',
};

export default function App() {
  const [s, dispatch] = useReducer(reducer, INITIAL_STATE);
  const facelets = useMemo(() => toFacelets(s.cube), [s.cube]);

  const onScramble = useCallback(() => {
    const seed = (Date.now() & SEED_MASK) >>> 0;
    dispatch({ type: 'SCRAMBLE', moves: scramble(mulberry32(seed)) });
  }, []);

  const onTurnDone = useCallback(() => dispatch({ type: 'TURN_DONE' }), []);

  const turn: Turn | null =
    s.phase === 'SCRAMBLING' && s.queueIndex < s.queue.length
      ? { move: s.queue[s.queueIndex], durationMs: SCRAMBLE_MS, onComplete: onTurnDone }
      : null;

  return (
    <div data-testid="app" data-phase={s.phase} style={APP_STYLE}>
      <ErrorBoundary>
        <Suspense fallback={<div style={FALLBACK_STYLE}>Loading cube…</div>}>
          <CubeView facelets={facelets} turn={turn} />
        </Suspense>
      </ErrorBoundary>
      <div style={CONTROLS_STYLE}>
        <button data-testid="scramble" onClick={onScramble} style={SCRAMBLE_BUTTON_STYLE}>
          🔀 Scramble
        </button>
      </div>
    </div>
  );
}
