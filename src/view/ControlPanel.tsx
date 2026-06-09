import type { CSSProperties } from 'react';
import type { Stage } from '../core/solver/types';

const STAGE_COLORS: readonly string[] = [
  '#f6e58d',
  '#ffbe76',
  '#ff7979',
  '#badc58',
  '#7ed6df',
  '#e056fd',
];

const LAST_STAGE_INDEX = 5;

export interface ControlPanelProps {
  phase: string;
  stages: readonly Stage[] | null;
  stageStart: readonly number[];
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

const CONTAINER_STYLE: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  alignItems: 'center',
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  gap: 8,
  fontSize: 22,
  fontWeight: 700,
  alignItems: 'baseline',
};

const CURRENT_MOVE_STYLE: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 26,
};

const COUNTER_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
};

const TIMELINE_STYLE: CSSProperties = {
  display: 'flex',
  width: 'min(640px, 90vw)',
  height: 14,
  borderRadius: 7,
  overflow: 'hidden',
  cursor: 'pointer',
};

const SCRUB_STYLE: CSSProperties = {
  width: 'min(640px, 90vw)',
};

const BUTTON_ROW_STYLE: CSSProperties = {
  display: 'flex',
  gap: 10,
};

const BUTTON_STYLE: CSSProperties = {
  fontSize: 18,
  padding: '10px 16px',
};

const PLAY_PAUSE_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  fontSize: 22,
};

export function ControlPanel(p: ControlPanelProps) {
  const haveSolution = p.stages !== null && p.totalMoves > 0;
  const stageIndexAt = (mi: number) => {
    let idx = 0;
    p.stageStart.forEach((s, i) => {
      if (mi >= s) idx = i;
    });
    return idx;
  };
  const curStage = haveSolution ? stageIndexAt(p.moveIndex) : -1;

  return (
    <div style={CONTAINER_STYLE}>
      {haveSolution && (
        <>
          <div style={HEADER_STYLE}>
            <span data-testid="stage-name">{p.stages![curStage].name}</span>
            <span data-testid="current-move" style={CURRENT_MOVE_STYLE}>
              {p.currentMove}
            </span>
            <span style={COUNTER_STYLE}>
              {p.moveIndex}/{p.totalMoves}
            </span>
          </div>
          <div style={TIMELINE_STYLE}>
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
            data-testid="scrub"
            type="range"
            min={0}
            max={p.totalMoves}
            value={p.moveIndex}
            onChange={(ev) => p.onSeek(Number(ev.target.value))}
            style={SCRUB_STYLE}
            aria-label="Scrub timeline"
          />
        </>
      )}
      <div style={BUTTON_ROW_STYLE}>
        <button data-testid="scramble" style={BUTTON_STYLE} onClick={p.onScramble}>
          🔀 Scramble
        </button>
        <button
          data-testid="solve"
          style={BUTTON_STYLE}
          onClick={p.onSolve}
          disabled={p.phase !== 'SCRAMBLED'}
        >
          🧠 Solve
        </button>
        <button
          data-testid="prev-stage"
          style={BUTTON_STYLE}
          aria-label="Jump to previous stage"
          disabled={!haveSolution}
          onClick={() =>
            p.onSeek(
              p.stageStart[
                Math.max(curStage - (p.moveIndex === p.stageStart[curStage] ? 1 : 0), 0)
              ],
            )
          }
        >
          ⏮
        </button>
        <button
          data-testid="step-back"
          style={BUTTON_STYLE}
          aria-label="Step back"
          disabled={!haveSolution || p.moveIndex === 0}
          onClick={() => p.onSeek(p.moveIndex - 1)}
        >
          ◀
        </button>
        {p.phase === 'PLAYING' ? (
          <button
            data-testid="pause"
            style={PLAY_PAUSE_BUTTON_STYLE}
            aria-label="Pause"
            onClick={p.onPause}
          >
            ⏸
          </button>
        ) : (
          <button
            data-testid="play"
            style={PLAY_PAUSE_BUTTON_STYLE}
            aria-label="Play"
            disabled={!haveSolution || p.moveIndex >= p.totalMoves}
            onClick={p.onPlay}
          >
            ▶
          </button>
        )}
        <button
          data-testid="step-fwd"
          style={BUTTON_STYLE}
          aria-label="Step forward"
          disabled={!haveSolution || p.moveIndex >= p.totalMoves}
          onClick={() => p.onSeek(p.moveIndex + 1)}
        >
          ▶︎
        </button>
        <button
          data-testid="next-stage"
          style={BUTTON_STYLE}
          aria-label="Jump to next stage"
          disabled={!haveSolution || curStage >= LAST_STAGE_INDEX}
          onClick={() => p.onSeek(p.stageStart[Math.min(curStage + 1, LAST_STAGE_INDEX)])}
        >
          ⏭
        </button>
        <select
          data-testid="speed"
          value={p.speed}
          onChange={(ev) => p.onSpeed(Number(ev.target.value))}
          style={BUTTON_STYLE}
          aria-label="Playback speed"
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </div>
    </div>
  );
}
