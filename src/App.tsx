import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer } from 'react';
import { solved, isSolved, type CubeState } from './core/cube-model/state';
import { apply } from './core/cube-model/apply';
import type { Face, Move } from './core/cube-model/moves';
import { toFacelets } from './core/facelets/facelets';
import { mulberry32 } from './core/scramble/rng';
import { scramble } from './core/scramble/scramble';
import { solve } from './core/solver/solve';
import type { PieceRef, Stage } from './core/solver/types';
import { buildSnapshots } from './core/playback/snapshots';
import { format } from './core/notation/notation';
import { ErrorBoundary } from './view/ErrorBoundary';
import type { Turn } from './view/CubeView';
import { ControlPanel } from './view/ControlPanel';
import { TeachingPanel } from './view/TeachingPanel';
import { stageIndexAt } from './view/stage-index';
import { targetPositions } from './view/piece-positions';

const CubeView = lazy(() => import('./view/CubeView').then((m) => ({ default: m.CubeView })));

const SCRAMBLE_MS = 180;
const PLAY_MS = 300;
const DWELL_MS = 800;
const DEFAULT_SPEED = 1;

type Phase = 'SOLVED' | 'SCRAMBLING' | 'SCRAMBLED' | 'PLAYING' | 'PAUSED';

type PlayMode = 'continuous' | 'single';

interface Solution {
  readonly stages: readonly Stage[];
  readonly moves: readonly Move[]; // flattened
  readonly stageStart: readonly number[]; // first move index of each stage
  readonly groupStart: readonly number[]; // first move index of each action group
  readonly groupWhy: readonly string[]; // parallel to groupStart
  readonly groupTargets: readonly (readonly PieceRef[])[]; // parallel to groupStart
  readonly snapshots: readonly CubeState[]; // length moves+1
}

interface AppState {
  phase: Phase;
  cube: CubeState;
  scrambleQueue: Move[];
  scrambleIndex: number;
  solution: Solution | null;
  moveIndex: number; // next solution move to play
  solveError: string | null;
  speed: number;
  autoContinue: boolean; // play through stage boundaries instead of pausing
  playMode: PlayMode; // single = pause again after the next completed move
  isDwelling: boolean; // brief between-actions hold while PLAYING
}

type Action =
  | { type: 'SCRAMBLE'; moves: Move[] }
  | { type: 'SCRAMBLE_TURN_DONE' }
  | { type: 'SOLVE'; solution: Solution }
  | { type: 'SOLVE_FAILED'; message: string }
  | { type: 'PLAY'; mode: PlayMode }
  | { type: 'PAUSE' }
  | { type: 'PLAY_TURN_DONE' }
  | { type: 'SEEK'; index: number }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'TOGGLE_AUTO' }
  | { type: 'DWELL_DONE' };

function buildSolution(cube: CubeState): Solution {
  const stages = solve(cube);
  const moves = stages.flatMap((st) => [...st.moves]);
  const stageStart: number[] = [];
  const groupStart: number[] = [];
  const groupWhy: string[] = [];
  const groupTargets: (readonly PieceRef[])[] = [];
  let acc = 0;
  for (const st of stages) {
    stageStart.push(acc);
    for (const g of st.groups) {
      groupStart.push(acc);
      groupWhy.push(g.why);
      groupTargets.push(g.targets);
      acc += g.moves.length;
    }
  }
  return {
    stages,
    moves,
    stageStart,
    groupStart,
    groupWhy,
    groupTargets,
    snapshots: buildSnapshots(cube, moves),
  };
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected solver error';
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'SCRAMBLE':
      return {
        ...s,
        phase: a.moves.length === 0 ? 'SCRAMBLED' : 'SCRAMBLING',
        cube: solved(),
        scrambleQueue: a.moves,
        scrambleIndex: 0,
        solution: null,
        moveIndex: 0,
        solveError: null,
        isDwelling: false,
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
        ? { ...s, solution: a.solution, moveIndex: 0, phase: 'PAUSED', solveError: null }
        : s;
    case 'SOLVE_FAILED':
      return { ...s, solveError: a.message };
    case 'PLAY':
      return s.solution && s.moveIndex < s.solution.moves.length
        ? { ...s, phase: 'PLAYING', playMode: a.mode }
        : s;
    case 'PAUSE':
      return s.phase === 'PLAYING' ? { ...s, phase: 'PAUSED', isDwelling: false } : s;
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
    case 'SEEK': {
      if (!s.solution) return s;
      const index = Math.max(0, Math.min(a.index, s.solution.moves.length));
      // cancel any in-flight turn by snapping phase to PAUSED; cube snaps to the snapshot
      const phase: Phase = index >= s.solution.moves.length ? 'SOLVED' : 'PAUSED';
      return { ...s, cube: s.solution.snapshots[index], moveIndex: index, phase, isDwelling: false };
    }
    case 'SET_SPEED':
      return { ...s, speed: a.speed };
    case 'TOGGLE_AUTO':
      return { ...s, autoContinue: !s.autoContinue };
    case 'DWELL_DONE':
      return s.isDwelling ? { ...s, isDwelling: false } : s;
  }
}

const INITIAL_STATE: AppState = {
  phase: 'SOLVED',
  cube: solved(),
  scrambleQueue: [],
  scrambleIndex: 0,
  solution: null,
  moveIndex: 0,
  solveError: null,
  speed: DEFAULT_SPEED,
  autoContinue: false,
  playMode: 'continuous',
  isDwelling: false,
};

export default function App() {
  const [s, dispatch] = useReducer(reducer, INITIAL_STATE);
  const facelets = useMemo(() => toFacelets(s.cube), [s.cube]);

  const onScramble = useCallback(
    () => dispatch({ type: 'SCRAMBLE', moves: scramble(mulberry32(Date.now() >>> 0)) }),
    [],
  );
  const onSolve = useCallback(() => {
    try {
      const solution = buildSolution(s.cube);
      dispatch({ type: 'SOLVE', solution });
    } catch (err: unknown) {
      dispatch({ type: 'SOLVE_FAILED', message: getErrorMessage(err) });
    }
  }, [s.cube]);
  const onPlay = useCallback(() => dispatch({ type: 'PLAY', mode: 'continuous' }), []);
  const onPlayOne = useCallback(() => dispatch({ type: 'PLAY', mode: 'single' }), []);
  const onPause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const onSeek = useCallback((index: number) => dispatch({ type: 'SEEK', index }), []);
  const onSpeed = useCallback((speed: number) => dispatch({ type: 'SET_SPEED', speed }), []);
  const onToggleAuto = useCallback(() => dispatch({ type: 'TOGGLE_AUTO' }), []);
  const onScrambleTurnDone = useCallback(() => dispatch({ type: 'SCRAMBLE_TURN_DONE' }), []);
  const onPlayTurnDone = useCallback(() => dispatch({ type: 'PLAY_TURN_DONE' }), []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (
        ev.target instanceof HTMLElement &&
        ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(ev.target.tagName)
      ) {
        return;
      }
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (s.phase === 'PLAYING') dispatch({ type: 'PAUSE' });
        else dispatch({ type: 'PLAY', mode: 'continuous' });
      }
      if (ev.code === 'ArrowRight') {
        ev.preventDefault();
        dispatch({ type: 'SEEK', index: s.moveIndex + 1 });
      }
      if (ev.code === 'ArrowLeft') {
        ev.preventDefault();
        dispatch({ type: 'SEEK', index: s.moveIndex - 1 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.phase, s.moveIndex]);

  useEffect(() => {
    if (s.phase !== 'PLAYING' || !s.isDwelling) return;
    const t = setTimeout(() => dispatch({ type: 'DWELL_DONE' }), DWELL_MS / s.speed);
    return () => clearTimeout(t);
  }, [s.phase, s.isDwelling, s.speed]);

  let turn: Turn | null = null;
  if (s.phase === 'SCRAMBLING' && s.scrambleIndex < s.scrambleQueue.length) {
    turn = {
      move: s.scrambleQueue[s.scrambleIndex],
      durationMs: SCRAMBLE_MS,
      onComplete: onScrambleTurnDone,
    };
  } else if (
    s.phase === 'PLAYING' &&
    !s.isDwelling &&
    s.solution &&
    s.moveIndex < s.solution.moves.length
  ) {
    turn = {
      move: s.solution.moves[s.moveIndex],
      durationMs: PLAY_MS / s.speed,
      onComplete: onPlayTurnDone,
    };
  }

  const currentMove =
    s.solution && s.moveIndex < s.solution.moves.length
      ? format([s.solution.moves[s.moveIndex]])
      : '';

  const hasSolution = s.solution !== null && s.solution.moves.length > 0;
  const currentStage = hasSolution ? stageIndexAt(s.solution!.stageStart, s.moveIndex) : -1;
  const groupIndex =
    hasSolution && s.moveIndex < s.solution!.moves.length
      ? stageIndexAt(s.solution!.groupStart, s.moveIndex)
      : -1;
  const actionWhy = groupIndex >= 0 ? s.solution!.groupWhy[groupIndex] : null;
  const highlightKeys = useMemo(
    () =>
      new Set(
        groupIndex >= 0
          ? targetPositions(s.cube, s.solution!.groupTargets[groupIndex]).map((p) => p.join(','))
          : [],
      ),
    [s.cube, s.solution, groupIndex],
  );

  // Layer cue: the face of the move that is animating (PLAYING) or pending
  // (PAUSED / dwelling). Covers play, dwell, stage pauses, seek, and stepping.
  const cueFace: Face | null =
    hasSolution &&
    s.moveIndex < s.solution!.moves.length &&
    (s.phase === 'PLAYING' || s.phase === 'PAUSED')
      ? s.solution!.moves[s.moveIndex].face
      : null;

  return (
    <div
      data-testid="app"
      data-phase={s.phase}
      data-solved={isSolved(s.cube)}
      data-cue-face={cueFace ?? undefined}
      className="relative h-screen w-screen overflow-hidden"
    >
      <header className="pointer-events-none absolute left-0 top-0 z-10 p-4 sm:p-5">
        <h1 className="font-display text-lg font-semibold leading-tight sm:text-xl">
          Rubik&apos;s Cube
        </h1>
        <p className="max-w-xs text-xs opacity-60 sm:text-sm">
          Scramble, then Solve to watch the beginner method step by step.
        </p>
      </header>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="grid h-full place-items-center">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
          }
        >
          <CubeView facelets={facelets} turn={turn} highlightKeys={highlightKeys} cueFace={cueFace} />
        </Suspense>
      </ErrorBoundary>
      {s.solveError && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4">
          <div data-testid="solve-error" role="alert" className="alert alert-error w-auto max-w-md shadow-lg">
            <span>{s.solveError}</span>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-3 sm:p-4">
        <TeachingPanel
          stages={s.solution?.stages ?? null}
          currentStage={currentStage}
          hasSolution={hasSolution}
          actionWhy={actionWhy}
        />
        <ControlPanel
          phase={s.phase}
          stages={s.solution?.stages ?? null}
          stageStart={s.solution?.stageStart ?? []}
          moveIndex={s.moveIndex}
          totalMoves={s.solution?.moves.length ?? 0}
          speed={s.speed}
          currentMove={currentMove}
          autoContinue={s.autoContinue}
          onScramble={onScramble}
          onSolve={onSolve}
          onPlay={onPlay}
          onPlayOne={onPlayOne}
          onPause={onPause}
          onSeek={onSeek}
          onSpeed={onSpeed}
          onToggleAuto={onToggleAuto}
        />
      </div>
    </div>
  );
}
