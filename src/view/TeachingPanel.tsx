import { useState } from 'react';
import { STAGE_NAMES, type Stage } from '../core/solver/types';
import { METHOD_INTRO, STAGE_LESSONS } from './teaching';
import { STAGE_COLORS } from './stage-colors';
import { HugeiconsIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface TeachingPanelProps {
  stages: readonly Stage[] | null;
  currentStage: number; // index into stages, or -1 when there is no solution
  hasSolution: boolean;
  actionWhy: string | null; // current action's why, null outside a solve
}

function activeLesson(stages: readonly Stage[] | null, currentStage: number, hasSolution: boolean) {
  return hasSolution && stages && currentStage >= 0 && currentStage < stages.length
    ? STAGE_LESSONS[stages[currentStage].name]
    : null;
}

export function TeachingPanel({ stages, currentStage, hasSolution, actionWhy }: TeachingPanelProps) {
  const [open, setOpen] = useState(true);
  const lesson = activeLesson(stages, currentStage, hasSolution);

  const detail = lesson ? (
    <>
      <p className="font-medium">{lesson.goal}</p>
      <p className="mt-1 opacity-70">{lesson.why}</p>
      {actionWhy && (
        <p
          data-testid="action-why"
          aria-live="polite"
          aria-atomic="true"
          className="mt-2 border-t border-base-content/10 pt-2"
        >
          <span className="font-display font-semibold">Now: </span>
          <span className="opacity-80">{actionWhy}</span>
        </p>
      )}
    </>
  ) : (
    <p className="opacity-70">{METHOD_INTRO}</p>
  );

  return (
    <>
      {/* Mobile: compact collapsible card stacked above the control bar. */}
      <div
        data-testid="teaching-panel"
        className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-base-200/80 p-3 shadow-2xl ring-1 ring-base-content/10 backdrop-blur-md sm:p-4 lg:hidden"
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
          aria-controls="teaching-detail"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="font-display text-sm font-semibold opacity-80">
            {lesson ? 'Why this step' : 'How the solve works'}
          </span>
          <span className="btn btn-ghost btn-xs btn-circle" aria-hidden>
            <HugeiconsIcon icon={open ? ChevronUpIcon : ChevronDownIcon} size={18} strokeWidth={2} />
          </span>
        </button>
        {open && (
          <div id="teaching-detail" className="mt-2 text-sm leading-snug">
            {detail}
          </div>
        )}
      </div>

      {/* Desktop: fixed left rail with the full roadmap + active detail. */}
      <div className="pointer-events-none fixed left-3 top-1/2 z-10 hidden w-72 -translate-y-1/2 lg:block">
        <div
          data-testid="teaching-rail"
          className="pointer-events-auto rounded-2xl bg-base-200/80 p-4 shadow-2xl ring-1 ring-base-content/10 backdrop-blur-md"
        >
          <h2 className="font-display text-base font-semibold">The beginner method</h2>
          <ol className="mt-3 flex flex-col gap-1.5">
            {STAGE_NAMES.map((name, i) => {
              const active = hasSolution && i === currentStage;
              return (
                <li
                  key={name}
                  data-testid={`stage-roadmap-${i}`}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-opacity ${
                    active ? 'bg-base-content/10 font-semibold' : 'opacity-60'
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: STAGE_COLORS[i] }}
                    aria-hidden
                  />
                  {name}
                </li>
              );
            })}
          </ol>
          <div className="mt-3 border-t border-base-content/10 pt-3 text-sm leading-snug">
            {detail}
          </div>
        </div>
      </div>
    </>
  );
}
