import type { GridViewNamespace, Outcome, TickView } from './contracts.js';
export type Visibility = {
    kind: 'public';
} | {
    kind: 'seats';
    seats: readonly string[];
} | {
    kind: 'hidden';
};
export interface ZoneVisibilityPolicy {
    /** Who may see which entries are in the zone. */
    identity(seat: string): Visibility;
    /** Who may see authored/internal order, independently of identity. */
    order(seat: string): Visibility;
}
export interface BoardVisibilityPolicy<TCell> {
    cellVisible(seat: string, cell: TCell): boolean;
    hiddenEntityMode: 'absent' | 'shell';
}
export interface BoardEntityView<TCell> {
    at: TCell;
    id?: string;
    [key: string]: unknown;
}
export interface BoardObservation<TCell, TEntity = BoardEntityView<TCell>> extends Omit<GridViewNamespace, 'targetableCells' | 'actionTargeting'> {
    cells?: readonly TCell[];
    entities?: readonly TEntity[];
    targetableCells?: readonly TCell[];
    actionTargeting?: Readonly<Record<string, {
        targetableCells: readonly TCell[];
    }>>;
    [key: string]: unknown;
}
export interface InformationPartitionPolicies<TCell, TEntry = unknown, TEntity = BoardEntityView<TCell>> {
    zones?: Readonly<Record<string, ZoneVisibilityPolicy>>;
    /** Policy for the single implicit board form of `TickView.grid`. */
    board?: BoardVisibilityPolicy<TCell>;
    /** Policies for the board-id record form of `TickView.grid`. */
    boards?: Readonly<Record<string, BoardVisibilityPolicy<TCell>>>;
    /** Stable identity used to mask hidden order. Defaults to canonical JSON. */
    entryKey?: (entry: TEntry) => string;
    /** Locate an entity for board visibility. Defaults to its `at` field. */
    entityCell?: (entity: TEntity) => TCell;
    /** Construct a presence-only entity. Defaults to `{ at, hidden: true }`. */
    shellEntity?: (entity: TEntity, at: TCell) => TEntity;
}
export interface TeamDefinition {
    id: string;
    seats: readonly string[];
}
export interface TeamRanking {
    teamId: string;
    rank: number;
    score?: number;
}
export type SpectatorVisibilityPolicy = {
    kind: 'public';
} | {
    kind: 'full';
    delayTurns?: number;
};
export interface InformationRevelation<TValue = unknown> {
    type: 'information.revealed';
    id: string;
    visibility: Visibility;
    value: TValue;
}
export declare function visibilityAllows(visibility: Visibility, seat: string): boolean;
export declare function teamForSeat(teams: readonly TeamDefinition[], seat: string): TeamDefinition | undefined;
/** Shared-vision set for a seat; an unteamed seat sees only itself. */
export declare function teamVisibility(teams: readonly TeamDefinition[], seat: string): Visibility;
/**
 * Expand a team ranking into the seat-ranked `Outcome` convention. Every
 * member receives its team's rank and optional score.
 */
export declare function outcomeForTeams(teams: readonly TeamDefinition[], ranking: readonly TeamRanking[], reason?: string): Outcome;
/** Create a standardized reveal record for observation/event streams. */
export declare function createInformationRevelation<TValue>(id: string, value: TValue, visibility?: Visibility): InformationRevelation<TValue>;
/** Filter standardized reveal records for one seat without changing order. */
export declare function revelationsForSeat<TValue>(revelations: readonly InformationRevelation<TValue>[], seat: string): readonly InformationRevelation<TValue>[];
/**
 * Derive a conventional per-seat view without mutating the full observation.
 *
 * Unconfigured zones/boards remain public. Products with custom view schemas
 * may implement `TickReducer.viewFor` directly and still use the leak checker.
 */
export declare function deriveSeatView<TCell, TEntry = unknown, TEntity = BoardEntityView<TCell>, TView extends TickView<unknown, unknown> = TickView<unknown, unknown>>(fullView: TView, policies: InformationPartitionPolicies<TCell, TEntry, TEntity>, seat: string): TView;
export interface InformationLeakCheckOptions<TState, TObservation> {
    baseline: TState;
    /** States that differ only in regions hidden from the observer. */
    variants: readonly TState[];
    observe(state: TState): TObservation | readonly TObservation[];
    /** Defaults to exact JSON serialization. */
    serialize?: (observation: TObservation | readonly TObservation[]) => string;
}
export declare class InformationLeakError extends Error {
    readonly variant: number;
    constructor(variant: number, message?: string);
}
/**
 * Assert that hidden-state permutations produce byte-identical observations.
 */
export declare function assertNoInformationLeak<TState, TObservation>(options: InformationLeakCheckOptions<TState, TObservation>): void;
