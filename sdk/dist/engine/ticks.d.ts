/** A validated fixed simulation cadence. */
export interface TickRate {
    /** Number of authoritative simulation ticks in one second. */
    readonly ticksPerSecond: number;
    /** Logical duration of one tick in seconds. */
    readonly secondsPerTick: number;
    /** Logical duration of one tick in milliseconds. */
    readonly millisecondsPerTick: number;
}
/**
 * Describe a fixed-rate simulation without coupling the deterministic engine
 * to a wall clock or scheduler.
 */
export declare function createTickRate(ticksPerSecond: number): TickRate;
/** Return the zero-based tick containing an elapsed wall-clock instant. */
export declare function tickAtElapsedMilliseconds(elapsedMilliseconds: number, rate: TickRate): number;
/** Return the elapsed logical milliseconds at the start of a zero-based tick. */
export declare function elapsedMillisecondsAtTick(tick: number, rate: TickRate): number;
