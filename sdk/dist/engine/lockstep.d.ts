import { type Reducer, type SessionView, type SubmittedAction } from './contracts.js';
export interface LockstepInput {
    tick: number;
    seat: string;
    actions: readonly SubmittedAction[];
}
export interface ResimulationOptions<TState> {
    /** First simulated tick. Defaults to zero. */
    fromTick?: number;
    /** Continue through this tick after the final input. */
    throughTick?: number;
    /** Product-owned scheduled work for an all-wait tick. Defaults to identity. */
    applyEmptyTick?: (state: TState, tick: number) => TState;
}
/**
 * Shared replay/rollback action fold. Lockstep ticks prefer one atomic batch;
 * legacy action transcripts retain their original serial semantics.
 *
 * @internal
 */
export declare function applyCanonicalActions<TLevel, TState, TView extends SessionView>(reducer: Reducer<TLevel, TState, TView>, state: TState, actions: readonly SubmittedAction[], atomic: boolean): TState;
/**
 * Canonical total order: tick, seat id, then authored submission order.
 */
export declare function canonicalizeLockstepInputs(inputs: readonly LockstepInput[]): LockstepInput[];
/**
 * Fold canonical per-tick inputs over a rollback snapshot.
 *
 * Canonical reducers receive an empty input batch for all-wait ticks. Legacy
 * reducers may provide `applyEmptyTick`; otherwise empty ticks remain identity
 * steps for compatibility.
 */
export declare function resimulate<TLevel, TState, TView extends SessionView>(reducer: Reducer<TLevel, TState, TView>, snapshotState: TState, inputs: readonly LockstepInput[], options?: ResimulationOptions<TState>): TState;
export interface StateDigestOptions<TState, TDigest> {
    serialize?: (state: TState) => string;
    hash?: (serialized: string) => TDigest;
}
/** Deterministic desync digest; products should inject canonical serialization. */
export declare function stateDigest<TState, TDigest = number>(state: TState, options?: StateDigestOptions<TState, TDigest>): TDigest;
