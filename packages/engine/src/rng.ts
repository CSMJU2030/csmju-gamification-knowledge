/**
 * Deterministic seeded RNG — mulberry32.
 * All engine randomness (variance, crit, evasion, drops, wave composition,
 * affix rolls, turn-order tiebreaks) flows through one of these streams.
 */
export type Rng = () => number; // uniform [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine several numbers into a single 32-bit seed (FNV-1a style). */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5 >>> 0;
  for (const p of parts) {
    const x = Math.floor(p) >>> 0;
    h ^= x;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Uniform integer in [min, max] inclusive. */
export function rngInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick a random element of a non-empty array. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Uniform damage variance in [0.9, 1.1]. */
export function variance(rng: Rng): number {
  return 0.9 + rng() * 0.2;
}
