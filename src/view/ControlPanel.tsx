import { STAGE_NAMES, type Stage } from '../core/solver/types';
import { STAGE_COLORS } from './stage-colors';
import { stageIndexAt } from './stage-index';
import { PlayPauseButton } from './PlayPauseButton';
import {
  HugeiconsIcon,
  ScrambleIcon,
  SolveIcon,
  PrevStageIcon,
  StepBackIcon,
  StepForwardIcon,
  NextStageIcon,
  AutoContinueIcon,
} from './icons';

const LAST_STAGE_INDEX = STAGE_NAMES.length - 1;

export interface ControlPanelProps {
  phase: string;
  stages: readonly Stage[] | null;
  stageStart: readonly number[];
  moveIndex: number;
  totalMoves: number;
  speed: number;
  currentMove: string; // formatted notation of the move about to play, '' at end
  autoContinue: boolean; // play through stage boundaries instead of pausing
  onScramble: () => void;
  onSolve: () => void;
  onPlay: () => void;
  onPlayOne: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onSpeed: (speed: number) => void;
  onToggleAuto: () => void;
}

export function ControlPanel(p: ControlPanelProps) {
  const haveSolution = p.stages !== null && p.totalMoves > 0;
  const curStage = haveSolution ? stageIndexAt(p.stageStart, p.moveIndex) : -1;
  const atEnd = p.moveIndex >= p.totalMoves;

  return (
    <div className="flex w-full justify-center">
      <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-2xl bg-base-200/80 p-3 shadow-2xl ring-1 ring-base-content/10 backdrop-blur-md sm:p-4">
        {haveSolution && (
          <>
            <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
              <span data-testid="stage-name" className="font-display text-xl font-semibold">
                {p.stages![curStage].name}
              </span>
              <span data-testid="current-move" className="badge badge-lg badge-primary font-mono text-base">
                {p.currentMove || '—'}
              </span>
              <span className="text-sm tabular-nums opacity-70">
                {p.moveIndex}/{p.totalMoves}
              </span>
            </div>
            <div className="flex h-3 w-full cursor-pointer overflow-hidden rounded-full ring-1 ring-base-content/10">
              {p.stages!.map((st, i) => (
                <div
                  key={st.name}
                  data-testid={`stage-seg-${i}`}
                  role="button"
                  tabIndex={0}
                  title={`Jump to ${st.name}`}
                  aria-label={`Jump to ${st.name}`}
                  onClick={() => p.onSeek(p.stageStart[i])}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      p.onSeek(p.stageStart[i]);
                    }
                  }}
                  className="transition-opacity"
                  style={{
                    flex: Math.max(st.moves.length, 1),
                    background: STAGE_COLORS[i],
                    opacity: i === curStage ? 1 : 0.4,
                  }}
                />
              ))}
            </div>
            <input
              data-testid="scrub"
              type="range"
              min={0}
              max={p.totalMoves}
              value={p.moveIndex}
              onChange={(ev) => p.onSeek(Number(ev.target.value))}
              className="range range-primary range-xs w-full"
              aria-label="Scrub timeline"
            />
          </>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button data-testid="scramble" className="btn btn-primary gap-2" onClick={p.onScramble}>
            <HugeiconsIcon icon={ScrambleIcon} size={20} strokeWidth={2} aria-hidden />
            Scramble
          </button>
          <button
            data-testid="solve"
            className="btn btn-accent gap-2"
            onClick={p.onSolve}
            disabled={p.phase !== 'SCRAMBLED'}
          >
            <HugeiconsIcon icon={SolveIcon} size={20} strokeWidth={2} aria-hidden />
            Solve
          </button>

          <div className="mx-1 h-8 w-px self-center bg-base-content/10" aria-hidden />

          <button
            data-testid="prev-stage"
            className="btn btn-circle btn-ghost"
            aria-label="Jump to previous stage"
            disabled={!haveSolution}
            onClick={() =>
              p.onSeek(
                p.stageStart[Math.max(curStage - (p.moveIndex === p.stageStart[curStage] ? 1 : 0), 0)],
              )
            }
          >
            <HugeiconsIcon icon={PrevStageIcon} size={22} strokeWidth={2} aria-hidden />
          </button>
          <button
            data-testid="step-back"
            className="btn btn-circle btn-ghost"
            aria-label="Step back"
            disabled={!haveSolution || p.moveIndex === 0}
            onClick={() => p.onSeek(p.moveIndex - 1)}
          >
            <HugeiconsIcon icon={StepBackIcon} size={22} strokeWidth={2} aria-hidden />
          </button>
          <PlayPauseButton
            isPlaying={p.phase === 'PLAYING'}
            disabled={!haveSolution || atEnd}
            onPlay={p.onPlay}
            onPlayOne={p.onPlayOne}
            onPause={p.onPause}
          />
          <button
            data-testid="step-fwd"
            className="btn btn-circle btn-ghost"
            aria-label="Step forward"
            disabled={!haveSolution || atEnd}
            onClick={() => p.onSeek(p.moveIndex + 1)}
          >
            <HugeiconsIcon icon={StepForwardIcon} size={22} strokeWidth={2} aria-hidden />
          </button>
          <button
            data-testid="next-stage"
            className="btn btn-circle btn-ghost"
            aria-label="Jump to next stage"
            disabled={!haveSolution || curStage >= LAST_STAGE_INDEX}
            onClick={() => p.onSeek(p.stageStart[Math.min(curStage + 1, LAST_STAGE_INDEX)])}
          >
            <HugeiconsIcon icon={NextStageIcon} size={22} strokeWidth={2} aria-hidden />
          </button>

          <div className="mx-1 h-8 w-px self-center bg-base-content/10" aria-hidden />

          <select
            data-testid="speed"
            value={p.speed}
            onChange={(ev) => p.onSpeed(Number(ev.target.value))}
            className="select select-sm select-bordered w-20"
            aria-label="Playback speed"
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>

          <label className="label min-h-11 cursor-pointer gap-1.5">
            <input
              data-testid="auto-continue"
              type="checkbox"
              checked={p.autoContinue}
              onChange={p.onToggleAuto}
              className="checkbox checkbox-primary checkbox-sm"
              aria-label="Auto-continue past stage pauses"
            />
            <HugeiconsIcon icon={AutoContinueIcon} size={18} strokeWidth={2} aria-hidden />
            <span className="text-sm opacity-80">Auto</span>
          </label>
        </div>
      </div>
    </div>
  );
}
