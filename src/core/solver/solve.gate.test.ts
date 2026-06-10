import { expect, test } from 'vitest';
import { isSolved, solved } from '../cube-model/state';
import { applyAll } from '../cube-model/apply';
import { mulberry32 } from '../scramble/rng';
import { scramble } from '../scramble/scramble';
import { solve } from './solve';
import { STAGE_NAMES } from './types';

test('10,000 random scrambles all solve to the solved state', () => {
  for (let seed = 0; seed < 10_000; seed++) {
    try {
      const start = applyAll(solved(), scramble(mulberry32(seed)));
      const stages = solve(start);
      expect(stages.map((s) => s.name)).toEqual(STAGE_NAMES);
      const end = applyAll(start, stages.flatMap((s) => [...s.moves]));
      expect(isSolved(end)).toBe(true);
      for (const stage of stages) {
        for (const g of stage.groups) {
          expect(g.why.trim().length).toBeGreaterThan(0);
          expect(g.moves.length).toBeGreaterThan(0);
          for (const t of g.targets) {
            expect(['edge', 'corner']).toContain(t.kind);
            const max = t.kind === 'edge' ? 11 : 7;
            expect(t.piece).toBeGreaterThanOrEqual(0);
            expect(t.piece).toBeLessThanOrEqual(max);
            expect(Number.isInteger(t.piece)).toBe(true);
          }
        }
        expect(stage.groups.flatMap((g) => [...g.moves])).toEqual([...stage.moves]);
      }
    } catch (err) {
      throw new Error(`seed=${seed}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
}, 120_000);
