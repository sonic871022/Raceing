export type Duration = {
    kind: 'until-phase-end';
    phaseId?: string;
} | {
    kind: 'rounds';
    remaining: number;
} | {
    kind: 'counters';
    remaining: number;
};
export interface TimedStatus<TValue = unknown> {
    id: string;
    /** Stable authored order used when several statuses expire together. */
    authoredOrder: number;
    duration: Duration;
    value: TValue;
}
export type DurationBoundary = {
    kind: 'phase-end';
    phaseId: string;
} | {
    kind: 'round-end';
};
export interface DurationAdvanceResult<TValue> {
    active: readonly TimedStatus<TValue>[];
    expired: readonly TimedStatus<TValue>[];
}
/**
 * Advance scheduled durations at one explicit product boundary.
 * Simultaneous expiries are returned in authored order.
 */
export declare function advanceDurations<TValue>(statuses: readonly TimedStatus<TValue>[], boundary: DurationBoundary): DurationAdvanceResult<TValue>;
/**
 * Spend counters on one status. Reaching zero expires it; unrelated statuses
 * remain untouched and the expired result follows authored ordering.
 */
export declare function spendStatusCounters<TValue>(statuses: readonly TimedStatus<TValue>[], statusId: string, count?: number): DurationAdvanceResult<TValue>;
