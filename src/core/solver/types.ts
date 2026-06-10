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

export interface PieceRef {
  readonly kind: 'edge' | 'corner';
  readonly piece: number; // cubie id: Edge.* (0-11) or Corner.* (0-7)
}

export interface ActionGroup {
  /** Beginner-facing reason for this action (1 line). */
  readonly why: string;
  /** Pieces the narration references; may be empty for setup-only actions. */
  readonly targets: readonly PieceRef[];
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
