export type Rng = () => number; // [0, 1)

const INCREMENT = 0x6d2b79f5;
const MIX1_SHIFT = 15;
const MIX2_SHIFT = 7;
const MIX2_ADD = 61;
const FINAL_SHIFT = 14;
const UINT32_MAX_PLUS_1 = 4294967296;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + INCREMENT) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> MIX1_SHIFT), t | 1);
    t ^= t + Math.imul(t ^ (t >>> MIX2_SHIFT), t | MIX2_ADD);
    return ((t ^ (t >>> FINAL_SHIFT)) >>> 0) / UINT32_MAX_PLUS_1;
  };
}
