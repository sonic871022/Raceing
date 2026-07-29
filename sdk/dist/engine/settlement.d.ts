/** How duplicate jobs with the same `kind + key` identity are scheduled. */
export type SettlementPolicy = 'repeat' | 'coalesce' | 'once';
/** One product-defined unit of settlement work. */
export interface SettlementJob {
    /** Stable rule or consequence kind. */
    kind: string;
    /** Stable identity within this settlement call. */
    key: string;
    /** Lower values run first within a wave. Defaults to zero. */
    priority?: number;
    /** Duplicate scheduling behavior. Defaults to `repeat`. */
    policy?: SettlementPolicy;
}
/** One resolved job in the causal settlement trace. */
export interface SettlementTraceEntry<TJob extends SettlementJob> {
    step: number;
    wave: number;
    job: TJob;
    /** The step that enqueued this job; absent for seed jobs. */
    parentStep?: number;
}
/** Operations available while resolving one settlement job. */
export interface SettlementContext<TState, TJob extends SettlementJob> {
    readonly state: TState;
    readonly step: number;
    readonly wave: number;
    /** Schedule a consequence for the next resolution wave of this tick. */
    enqueue(job: TJob): boolean;
    /** Return work to the caller without executing it during this tick. */
    defer(job: TJob): void;
}
export type SettlementResolver<TState, TJob extends SettlementJob> = (job: TJob, context: SettlementContext<TState, TJob>) => void;
export interface SettlementOptions {
    /** Hard safety guard. Normal settlement must reach quiescence before this. */
    maxSteps: number;
}
export interface SettlementResult<TState, TJob extends SettlementJob> {
    state: TState;
    steps: number;
    waves: number;
    trace: Array<SettlementTraceEntry<TJob>>;
    /** Jobs deliberately left for a later tick. */
    deferred: TJob[];
}
/** Raised when same-tick resolution does not reach quiescence within its guard. */
export declare class SettlementLimitError<TJob extends SettlementJob = SettlementJob> extends Error {
    readonly maxSteps: number;
    readonly nextJob: TJob;
    constructor(maxSteps: number, nextJob: TJob);
}
/**
 * Resolve product-defined consequences in deterministic resolution waves.
 *
 * Every job enqueued by a resolver runs no earlier than the following wave.
 * The caller owns state mutation and rule semantics; this function owns work
 * ordering, duplicate policy, deferral, tracing, and convergence enforcement.
 */
export declare function runSettlementCascade<TState, TJob extends SettlementJob>(state: TState, seeds: readonly TJob[], resolve: SettlementResolver<TState, TJob>, options: SettlementOptions): SettlementResult<TState, TJob>;
