import type { Face, Move, Turns } from '../cube-model/moves';

const FACES = new Set(['U', 'D', 'L', 'R', 'F', 'B']);
const VALID_SUFFIXES = ['', "'", '2'] as const;
const TURNS_PRIME: Turns = 3;
const TURNS_DOUBLE: Turns = 2;
const TURNS_SINGLE: Turns = 1;

/**
 * Parse a whitespace-separated Singmaster move sequence (e.g. `"R U R' U'"`)
 * into an array of `Move` values.
 *
 * @param s Space-separated move tokens. Tokens are one face letter followed by
 *   optional `'` (counterclockwise) or `2` (half turn).
 * @returns The parsed moves in input order.
 * @throws {Error} If any token is malformed (unknown face or invalid suffix).
 */
export function parse(s: string): Move[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const face = tok[0] as Face;
      const suffix = tok.slice(1);
      if (!FACES.has(face) || !(VALID_SUFFIXES as readonly string[]).includes(suffix)) {
        throw new Error(`Invalid move token: "${tok}"`);
      }
      const turns: Turns =
        suffix === "'" ? TURNS_PRIME : suffix === '2' ? TURNS_DOUBLE : TURNS_SINGLE;
      return { face, turns };
    });
}

/**
 * Format an array of `Move` values back into Singmaster notation.
 *
 * @param moves The moves to format.
 * @returns A space-separated string, e.g. `"R U R' U'"`.
 */
export function format(moves: readonly Move[]): string {
  return moves
    .map((m) => m.face + (m.turns === TURNS_PRIME ? "'" : m.turns === TURNS_DOUBLE ? '2' : ''))
    .join(' ');
}
