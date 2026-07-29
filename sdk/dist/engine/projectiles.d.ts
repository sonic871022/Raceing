export type ProjectileAction = 'advance' | 'land' | 'consume';
export interface PathProjectileOptions<TProjectile, TCell> {
    /** Next path cell, or undefined when the projectile exhausted its path. */
    next(projectile: TProjectile): TCell | undefined;
    /** Decide what reaching the next cell does. */
    collide(projectile: TProjectile, next: TCell): ProjectileAction;
    /** Commit one-cell advancement. */
    advance(projectile: TProjectile, next: TCell): void;
    /** Commit a resting landing at the projectile's current position. */
    land(projectile: TProjectile): void;
    /** Remove a projectile whose collision effect consumed it. */
    consume(projectile: TProjectile): void;
}
/**
 * Advance every projectile present at the start of the pass by at most one
 * cell. Collection mutation by land/consume callbacks cannot skip another
 * projectile because the input is snapshotted before iteration.
 */
export declare function advancePathProjectiles<TProjectile, TCell>(projectiles: readonly TProjectile[], options: PathProjectileOptions<TProjectile, TCell>): boolean;
export interface FlightPassOptions<TState> {
    /** Product-authored pass limit. Active state may remain after this limit. */
    maxPasses: number;
    active(state: TState): boolean;
    /** Relay/redirection hook evaluated before each movement pass. */
    beforePass?(state: TState, pass: number): void;
    /** Advance every currently active flyer by one microstep. */
    advancePass(state: TState, pass: number): void;
}
export interface FlightPassResult<TState> {
    state: TState;
    passes: number;
    completed: boolean;
}
/** Resolve full same-tick flight, with an optional relay hook between passes. */
export declare function resolveFlightPasses<TState>(state: TState, options: FlightPassOptions<TState>): FlightPassResult<TState>;
