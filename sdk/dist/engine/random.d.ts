/** Deterministic mulberry32 pseudo-random number generator. */
export declare function mulberry32(seed: number): () => number;
/** FNV-1a 32-bit hash used to fold an event key into a seed. */
export declare function fnv1a(value: string): number;
/** One deterministic draw in `[0, 1)` for an event-keyed random outcome. */
export declare function roll(seed: number, eventKey: string): number;
/** Deterministic Fisher-Yates permutation of `[0, n)`. */
export declare function seededPermutation(n: number, seed: number): number[];
