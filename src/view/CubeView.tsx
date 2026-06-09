import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo } from 'react';
import type { FaceName } from '../core/facelets/facelets';
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

interface CubeletProps {
  pos: Vec3;
  facelets: FaceName[];
}

function Cubelet({ pos, facelets }: CubeletProps) {
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
}

interface CubeViewProps {
  facelets: FaceName[];
}

export function CubeView({ facelets }: CubeViewProps) {
  return (
    <Canvas camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}>
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight position={DIRECTIONAL_POSITION} intensity={DIRECTIONAL_INTENSITY} />
      {POSITIONS.map((p) => (
        <Cubelet key={p.join(',')} pos={p} facelets={facelets} />
      ))}
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
