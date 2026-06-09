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

export interface Stage {
  readonly name: StageName;
  readonly moves: readonly Move[];
}

export class StageCapError extends Error {
  constructor(stage: StageName, detail: string) {
    super(`Solver stage "${stage}" failed: ${detail}`);
    this.name = 'StageCapError';
  }
}
