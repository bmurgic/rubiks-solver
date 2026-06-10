import type { Move } from '../cube-model/moves';

export type StageName = 'Daisy' | 'Cross' | 'First Layer' | 'Second Layer' | 'OLL' | 'PLL';

export const STAGE_NAMES: readonly StageName[] = [
  'Daisy',
  'Cross',
  'First Layer',
  'Second Layer',
  'OLL',
  'PLL',
];

export interface ActionGroup {
  /** Beginner-facing reason for this action (1 line). */
  readonly why: string;
  readonly moves: readonly Move[]; // cleaned; never empty
}

export interface Stage {
  readonly name: StageName;
  readonly groups: readonly ActionGroup[];
  readonly moves: readonly Move[]; // concatenation of group moves
}

export class StageCapError extends Error {
  constructor(stage: StageName, detail: string) {
    super(`Solver stage "${stage}" failed: ${detail}`);
    this.name = 'StageCapError';
  }
}
