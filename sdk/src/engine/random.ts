/** Deterministic mulberry32 pseudo-random number generator. */
export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash used to fold an event key into a seed. */
export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One deterministic draw in `[0, 1)` for an event-keyed random outcome. */
export function roll(seed: number, eventKey: string): number {
  return mulberry32((seed ^ fnv1a(eventKey)) >>> 0)();
}

/** Deterministic Fisher-Yates permutation of `[0, n)`. */
export function seededPermutation(n: number, seed: number): number[] {
  const random = mulberry32(seed);
  const permutation = Array.from({ length: n }, (_, index) => index);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const previous = permutation[i]!;
    permutation[i] = permutation[j]!;
    permutation[j] = previous;
  }
  return permutation;
}
