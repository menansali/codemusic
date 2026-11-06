/** Deterministic PRNG utilities. Never use Math.random in render code. */

/** FNV-1a 32-bit string hash. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for visual jitter. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a generator from any seed-like value plus a namespace string. */
export function rng(seed: number | string, namespace = ''): () => number {
  const base = typeof seed === 'number' ? seed : hashString(seed);
  return mulberry32((base ^ hashString(namespace)) >>> 0);
}

/** Single deterministic value in [0,1) for a seed + key, without keeping generator state. */
export function seededValue(seed: number | string, key: string): number {
  return rng(seed, key)();
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  const idx = Math.floor(random() * items.length);
  return items[Math.min(idx, items.length - 1)] as T;
}

export function range(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}
