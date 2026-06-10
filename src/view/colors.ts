import type { FaceName } from '../core/facelets/facelets';

// Single knob to soften every sticker color at once: fraction blended toward
// white. 0 = full WCA saturation, 1 = white. Bump up for more pastel.
const PASTEL_STRENGTH = 0.2;

// Base WCA palette. Convention: U=yellow, R=orange, F=green, D=white, L=red, B=blue.
const BASE_FACE_COLORS: Record<FaceName, string> = {
  U: '#FFD500',
  R: '#FF8000',
  F: '#009E60',
  D: '#FFFFFF',
  L: '#C41E3A',
  B: '#0051BA',
};

// Lerp a #RRGGBB hex toward white by `t` (0..1).
function pastelize(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export const FACE_COLORS: Record<FaceName, string> = Object.fromEntries(
  Object.entries(BASE_FACE_COLORS).map(([face, hex]) => [face, pastelize(hex, PASTEL_STRENGTH)]),
) as Record<FaceName, string>;

export const PLASTIC = '#101010';
