import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { memo, useMemo, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { FaceName } from '../core/facelets/facelets';
import type { Face, Move } from '../core/cube-model/moves';
import { FACE_COLORS, PLASTIC } from './colors';
import { faceletIndexAt, type Vec3 } from './facelet-grid';
import { HugeiconsIcon, ResetViewIcon } from './icons';

const GRID: readonly number[] = [-1, 0, 1];
const CUBELET_SPACING = 1.05;
const CUBELET_SIZE = 1;
const CAMERA_POSITION: Vec3 = [4.5, 4.5, 4.5];
const CAMERA_FOV = 40;
const AMBIENT_INTENSITY = 0.7;
const KEY_INTENSITY = 1.4;
const KEY_POSITION: Vec3 = [5, 10, 7];
const FILL_INTENSITY = 0.5;
const FILL_POSITION: Vec3 = [-6, 2, -4];
const HEMI_INTENSITY = 0.5;
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 14;

// Material sheen for the colored facelets — clean plastic, no metal.
const FACELET_ROUGHNESS = 0.35;
const FACELET_METALNESS = 0;

// Soft ground shadow placed just below the lowest cubelet layer.
const SHADOW_Y = -1.7;

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

// [frontend-patterns] memoized — skips cubelet re-renders when only `turn`/phase changes
// and the cube state is unchanged. On those renders the parent's `useMemo`d facelets array
// stays referentially stable, so all 26 instances bail out. (When a TURN_DONE commit
// produces a new facelets array, every cubelet does re-render — that's intentional.)
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
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          color={c}
          roughness={FACELET_ROUGHNESS}
          metalness={FACELET_METALNESS}
        />
      ))}
    </mesh>
  );
});

interface TurningGroupProps {
  turn: Turn;
  children: ReactNode;
}

/**
 * Animates the cubelets of a single face turning to the target angle.
 *
 * Parent MUST remount this component (via `key`) for every new turn; the
 * `elapsed` and `done` refs reset only on mount. The current key
 * `${face}${turns}-${facelets.join('')}` is sound because applying a move
 * always changes the facelets string.
 *
 * On completion the group stays at the final rotation angle (NOT reset to 0)
 * — the recolor commits asynchronously via `onComplete`, and resetting here
 * would render one frame of old colors at angle 0, producing a visible
 * snap-back. The key-change remount on the next turn handles the visual
 * reset cleanly once new state has committed.
 */
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
      // Leave rotation at the final angle; the remount on key change handles reset.
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
  const controls = useRef<OrbitControlsImpl>(null);
  const resetView = () => controls.current?.reset();
  return (
    <div className="cube-stage absolute inset-0" onDoubleClick={resetView}>
      <Canvas camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}>
        <ambientLight intensity={AMBIENT_INTENSITY} />
        <hemisphereLight intensity={HEMI_INTENSITY} color="#cdd6ff" groundColor="#1e1b4b" />
        <directionalLight position={KEY_POSITION} intensity={KEY_INTENSITY} />
        <directionalLight position={FILL_POSITION} intensity={FILL_INTENSITY} />
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
        <ContactShadows
          position={[0, SHADOW_Y, 0]}
          opacity={0.45}
          scale={12}
          blur={2.5}
          far={5}
          resolution={512}
          color="#000000"
        />
        <OrbitControls
          ref={controls}
          enablePan={false}
          enableDamping
          minDistance={MIN_DISTANCE}
          maxDistance={MAX_DISTANCE}
          makeDefault
        />
      </Canvas>
      <button
        data-testid="reset-view"
        aria-label="Reset view"
        className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 bg-base-200/70 backdrop-blur-md"
        onClick={resetView}
      >
        <HugeiconsIcon icon={ResetViewIcon} size={20} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
