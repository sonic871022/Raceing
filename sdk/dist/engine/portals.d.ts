import type { LocationCoord, LocationRef } from './locations.js';
export interface PortalEdge {
    id: string;
    from: LocationRef;
    to: LocationRef;
    bidirectional?: boolean;
    /** Lower values resolve first among simultaneous transits. */
    priority?: number;
}
export type PortalInsertPolicy<TState = unknown, TEntity = unknown> = {
    mode: 'top' | 'bottom';
} | {
    mode: 'index' | 'slot';
    pick(state: TState, entity: TEntity, edge: PortalEdge): number | string;
};
export interface PortalPolicy<TState, TEntity> {
    entityId(entity: TEntity): string;
    isActive(state: TState, edge: PortalEdge): boolean;
    canTransit(state: TState, entity: TEntity, edge: PortalEdge): boolean;
    /** Resolve ambiguous string coordinates as graph boards or slotted zones. */
    destinationKind?(state: TState, entity: TEntity, edge: PortalEdge): 'board' | 'zone';
    /** Zone destination adaptation. */
    insertInto?: PortalInsertPolicy<TState, TEntity>;
    /** Board exit anchor. Omission uses `edge.to.coord`. */
    placeOnto?(state: TState, entity: TEntity, edge: PortalEdge): LocationCoord | null;
    /** Full occupied-cell set for board footprint rehydration. */
    occupiesAt?(entity: TEntity, at: LocationCoord): readonly LocationCoord[];
    /** Product-owned destination occupancy/terrain validation. */
    canEnter?(state: TState, entity: TEntity, edge: PortalEdge, destination: LocationRef, occupied: readonly LocationRef[]): boolean;
    /** Capacity of one destination claim key. Defaults to one. */
    capacityAt?(state: TState, destination: LocationRef): number;
    /** Runs exactly once per committed edge traversal. */
    transform?(entity: TEntity, edge: PortalEdge): TEntity;
}
export interface PortalEntrant<TEntity> {
    entity: TEntity;
    at: LocationRef;
    /** Optional authored edge selection when several edges share an entrance. */
    edgeId?: string;
    /** Entrants sharing a group transit atomically. */
    group?: string;
    /** Lower values resolve first after edge ordering. Defaults to zero. */
    priority?: number;
    /** Settlement wave supplied by the product. Defaults to zero. */
    wave?: number;
}
export interface PortalPlanningOptions {
    maxPasses: number;
    contention?: 'all-fail' | 'priority';
}
export interface PortalZoneAdaptation {
    kind: 'zone';
    mode: 'top' | 'bottom' | 'index' | 'slot';
    position?: number | string;
}
export interface PortalBoardAdaptation {
    kind: 'board';
    occupied: readonly LocationRef[];
}
export type PortalAdaptation = PortalZoneAdaptation | PortalBoardAdaptation;
export interface PortalTransit<TEntity> {
    entityId: string;
    entity: TEntity;
    group: string;
    from: LocationRef;
    to: LocationRef;
    edge: PortalEdge;
    reversed: boolean;
    pass: number;
    wave: number;
    edgePriority: number;
    edgeOrder: number;
    entrantPriority: number;
    entrantOrder: number;
    adaptation: PortalAdaptation;
}
export type PortalTransitFailureCode = 'duplicate_edge' | 'duplicate_entity' | 'unknown_edge' | 'inactive' | 'transit_denied' | 'invalid_destination' | 'destination_blocked' | 'contested' | 'group_failed' | 'cycle' | 'pass_limit' | 'stale_plan';
export interface PortalRejectedEntrant<TEntity> {
    entrant: PortalEntrant<TEntity>;
    code: PortalTransitFailureCode;
    message: string;
}
export interface PortalTransitPlan<TState, TEntity> {
    ok: true;
    transits: readonly PortalTransit<TEntity>[];
    rejected: readonly PortalRejectedEntrant<TEntity>[];
    /** Original state identity used to reject stale commits. */
    readonly baseState: TState;
}
export interface PortalTransitFailure<TState, TEntity> {
    ok: false;
    code: PortalTransitFailureCode;
    message: string;
    rejected: readonly PortalRejectedEntrant<TEntity>[];
    readonly baseState: TState;
}
export interface CommittedPortalTransit<TEntity> extends PortalTransit<TEntity> {
    /** Entity after this edge's transformation. */
    committedEntity: TEntity;
}
export interface PortalCommitter<TState, TEntity> {
    /** Product performs all removals/insertions as one authoritative mutation. */
    commit(state: TState, transits: readonly CommittedPortalTransit<TEntity>[]): TState;
    /** Called only after the complete state commit, in deterministic transit order. */
    arrive?(state: TState, transit: CommittedPortalTransit<TEntity>): void;
}
export type PortalCommitResult<TState, TEntity> = {
    ok: true;
    state: TState;
    transits: readonly CommittedPortalTransit<TEntity>[];
} | PortalTransitFailure<TState, TEntity>;
/**
 * Plan bounded, heterogeneous portal paths and arbitrate destination capacity
 * without mutating product state.
 */
export declare function planPortalTransits<TState, TEntity>(state: TState, entrants: readonly PortalEntrant<TEntity>[], edges: readonly PortalEdge[], policy: PortalPolicy<TState, TEntity>, options: PortalPlanningOptions): PortalTransitPlan<TState, TEntity> | PortalTransitFailure<TState, TEntity>;
/**
 * Transform every edge traversal exactly once, commit the complete batch,
 * then dispatch arrivals. No product mutation occurs for rejected entrants.
 */
export declare function commitPortalTransits<TState, TEntity>(state: TState, plan: PortalTransitPlan<TState, TEntity>, policy: PortalPolicy<TState, TEntity>, committer: PortalCommitter<TState, TEntity>): PortalCommitResult<TState, TEntity>;
