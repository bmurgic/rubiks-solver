/**
 * Index of the stage that owns move `moveIndex`, given each stage's first-move
 * offset (`stageStart`). Walks the offsets and keeps the last one not exceeding
 * `moveIndex`. Returns 0 for a single-stage / zero start list.
 */
export function stageIndexAt(stageStart: readonly number[], moveIndex: number): number {
  let idx = 0;
  stageStart.forEach((s, i) => {
    if (moveIndex >= s) idx = i;
  });
  return idx;
}
