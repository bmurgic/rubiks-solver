import { useState } from 'react';
import type { Stage } from '../core/solver/types';
import { METHOD_INTRO, STAGE_LESSONS } from './teaching';
import { HugeiconsIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface TeachingPanelProps {
  stages: readonly Stage[] | null;
  currentStage: number; // index into stages, or -1 when there is no solution
  hasSolution: boolean;
}

export function TeachingPanel({ stages, currentStage, hasSolution }: TeachingPanelProps) {
  const [open, setOpen] = useState(true);
  const lesson =
    hasSolution && stages && currentStage >= 0 ? STAGE_LESSONS[stages[currentStage].name] : null;

  return (
    <div
      data-testid="teaching-panel"
      className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-base-200/80 p-3 shadow-2xl ring-1 ring-base-content/10 backdrop-blur-md sm:p-4"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
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
        <div className="mt-2 text-sm leading-snug">
          {lesson ? (
            <>
              <p className="font-medium">{lesson.goal}</p>
              <p className="mt-1 opacity-70">{lesson.why}</p>
            </>
          ) : (
            <p className="opacity-70">{METHOD_INTRO}</p>
          )}
        </div>
      )}
    </div>
  );
}
