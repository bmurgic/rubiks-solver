export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Turns = 1 | 2 | 3; // 3 = counterclockwise (prime)
export interface Move {
  readonly face: Face;
  readonly turns: Turns;
}

export function move(face: Face, turns: Turns = 1): Move {
  return { face, turns };
}

export function inverse(m: Move): Move {
  return { face: m.face, turns: ((4 - m.turns) % 4) as Turns };
}
