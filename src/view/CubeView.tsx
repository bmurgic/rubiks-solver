import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { memo, useMemo, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import type { FaceName } from '../core/facelets/facelets';
import type { Face, Move } from '../core/cube-model/moves';
import { FACE_COLORS, PLASTIC } from './colors';
import { faceletIndexAt, type Vec3 } from './facelet-grid';

const GRID: readonly number[] = [-1, 0, 1];
const CUBELET_SPACING = 1.05;
const CUBELET_SIZE = 1;
const CAMERA_POSITION: Vec3 = [4.5, 4.5, 4.5];
const CAMERA_FOV = 40;
const AMBIENT_INTENSITY = 1.2;
const DIRECTIONAL_INTENSITY = 1.5;
const DIRECTIONAL_POSITION: Vec3 = [5, 10, 7];
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 14;

const QUARTER_TURN_RAD = Math.PI / 2;
const PRIME_TURNS = 3 as const;
const MS_PER_SEC = 1000;

// three.js BoxGeometry material order: +x, -x, +y, -y, +z, -z.
const BOX_NORMALS: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const POSITIONS: readonly Vec3[] = GRID.flatMap((x) =>
  GRID.flatMap((y) => GRID.map((z) => [x, y, z] as Vec3)),
).filter(([x, y, z]) => !(x === 0 && y === 0 && z === 0)); // 26 cubelets, no hidden core.

// Which grid positions belong to each face (constant — meshes never move).
const FACE_SELECTOR: Record<Face, (p: Vec3) => boolean> = {
  U: (p) => p[1] === 1,
  D: (p) => p[1] === -1,
  R: (p) => p[0] === 1,
  L: (p) => p[0] === -1,
  F: (p) => p[2] === 1,
  B: (p) => p[2] === -1,
};

// Rotation axis (face normal); clockwise turn (viewed looking at the face) = negative rotation about it.
const FACE_AXIS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

export interface Turn {
  readonly move: Move;
  readonly durationMs: number;
  readonly onComplete: () => void;
}

interface CubeletProps {
  pos: Vec3;
  facelets: FaceName[];
}

// [frontend-patterns] memoized — 26 instances; skip re-render when pos/facelets are unchanged
const Cubelet = memo(function Cubelet({ pos, facelets }: CubeletProps) {
  const colors = useMemo(
    () =>
      BOX_NORMALS.map((n) => {
        const idx = faceletIndexAt(pos, n);
        return idx === null ? PLASTIC : FACE_COLORS[facelets[idx]];
      }),
    [pos, facelets],
  );
  return (
    <mesh position={[pos[0] * CUBELET_SPACING, pos[1] * CUBELET_SPACING, pos[2] * CUBELET_SPACING]}>
      <boxGeometry args={[CUBELET_SIZE, CUBELET_SIZE, CUBELET_SIZE]} />
      {colors.map((c, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={c} />
      ))}
    </mesh>
  );
});

interface TurningGroupProps {
  turn: Turn;
  children: ReactNode;
}

function TurningGroup({ turn, children }: TurningGroupProps) {
  const ref = useRef<Group>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  // Direction: clockwise (1 quarter, 2 half) rotates negatively about the face normal;
  // 3 (prime) flips to positive 90°.
  const directionalTurns = turn.move.turns === PRIME_TURNS ? -1 : turn.move.turns;
  const target = -QUARTER_TURN_RAD * directionalTurns;
  const axis = FACE_AXIS[turn.move.face];

  useFrame((_, delta) => {
    if (done.current || !ref.current) return;
    elapsed.current += delta * MS_PER_SEC;
    const t = Math.min(elapsed.current / turn.durationMs, 1);
    const angle = target * t;
    ref.current.rotation.set(axis[0] * angle, axis[1] * angle, axis[2] * angle);
    if (t === 1) {
      done.current = true;
      ref.current.rotation.set(0, 0, 0); // reset; recolor happens via onComplete state change
      turn.onComplete();
    }
  });
  return <group ref={ref}>{children}</group>;
}

interface CubeViewProps {
  facelets: FaceName[];
  turn: Turn | null;
}

export function CubeView({ facelets, turn }: CubeViewProps) {
  const turning = turn ? POSITIONS.filter(FACE_SELECTOR[turn.move.face]) : [];
  const still = turn ? POSITIONS.filter((p) => !FACE_SELECTOR[turn.move.face](p)) : POSITIONS;
  return (
    <Canvas camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}>
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight position={DIRECTIONAL_POSITION} intensity={DIRECTIONAL_INTENSITY} />
      {still.map((p) => (
        <Cubelet key={p.join(',')} pos={p} facelets={facelets} />
      ))}
      {turn && (
        <TurningGroup
          key={`${turn.move.face}${turn.move.turns}-${facelets.join('')}`}
          turn={turn}
        >
          {turning.map((p) => (
            <Cubelet key={p.join(',')} pos={p} facelets={facelets} />
          ))}
        </TurningGroup>
      )}
      <OrbitControls
        enablePan={false}
        enableDamping
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        makeDefault
      />
    </Canvas>
  );
}
