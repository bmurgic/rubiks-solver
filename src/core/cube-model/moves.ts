export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Turns = 1 | 2 | 3; // 3 = counterclockwise (prime)
export interface Move {
  readonly face: Face;
  readonly turns: Turns;
}

/**
 * Construct a `Move` value.
 *
 * @param face Face to turn (`U`, `D`, `L`, `R`, `F`, or `B`).
 * @param turns Quarter turns (1 = CW, 2 = half, 3 = CCW). Defaults to 1.
 * @returns A `Move` literal.
 */
export function move(face: Face, turns: Turns = 1): Move {
  return { face, turns };
}

/**
 * Invert a move so that `apply(apply(s, m), inverse(m))` equals `s`.
 *
 * @param m The move to invert.
 * @returns A move on the same face whose turns sum with `m.turns` to 4.
 */
export function inverse(m: Move): Move {
  return { face: m.face, turns: ((4 - m.turns) % 4) as Turns };
}
