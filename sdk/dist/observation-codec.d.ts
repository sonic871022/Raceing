import { type JsonValue } from './protocol.js';
export type JsonPatchOperation = {
    op: 'add' | 'replace';
    path: string;
    value: JsonValue;
} | {
    op: 'remove';
    path: string;
};
/** Deterministic RFC-6902 subset. Arrays are atomically replaced. */
export declare function createJsonPatch(previous: JsonValue, next: JsonValue): JsonPatchOperation[];
/** @internal Inputs have already passed the session canonical JSON boundary. */
/**
 * Build a patch, optionally abandoning the walk once it exceeds `maxOperations`.
 *
 * Returns `null` only when a limit was supplied and exceeded, so the caller can
 * fall back to a snapshot *without having paid for the full diff*. Called with
 * two arguments the behaviour is unchanged and the result is never `null`.
 */
export declare function createValidatedJsonPatch(previous: JsonValue, next: JsonValue, maxOperations?: number): JsonPatchOperation[] | null;
/**
 * Build a patch while enforcing operation and canonical-byte bounds during the
 * walk. The canonical form is returned so callers do not serialize it twice.
 *
 * @internal Inputs have already passed the session canonical JSON boundary.
 */
export declare function createBoundedValidatedJsonPatch(previous: JsonValue, next: JsonValue, maxOperations: number, maxBytes: number): {
    operations: JsonPatchOperation[];
    canonical: string;
    bytes: number;
} | null;
/** Apply the safe RFC-6902 subset without mutating the prior snapshot. */
export declare function applyJsonPatch(previous: JsonValue, operations: readonly JsonPatchOperation[]): JsonValue;
export declare function isJsonProjection(source: JsonValue, projected: JsonValue): boolean;
