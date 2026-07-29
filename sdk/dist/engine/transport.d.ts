import type { Cell, Mover } from './movement.js';
export interface DirectedTransportOccupant {
    id: string;
    at: Cell;
    priority: number;
    footprint?: Mover['footprint'];
    swapOk?: string[];
}
export interface DirectedTransportOptions<TOccupant extends DirectedTransportOccupant> {
    directionAt(cell: Cell): Cell | undefined;
    activeAt?(cell: Cell): boolean;
    canEnter?(occupant: TOccupant, destination: Cell): boolean;
}
/** Convert occupants resting on active directed cells into movement proposals. */
export declare function proposeDirectedTransport<TOccupant extends DirectedTransportOccupant>(occupants: readonly TOccupant[], options: DirectedTransportOptions<TOccupant>): Mover[];
export interface TransportRunOptions<TState> {
    maxPasses: number;
    /** Resolve and commit one simultaneous pass; return how many occupants moved. */
    step(state: TState, pass: number): number;
}
export interface TransportRunResult<TState> {
    state: TState;
    passes: number;
    moves: number;
    /** False when work was still moving at the authored pass cap. */
    completed: boolean;
}
/** Repeat simultaneous directed-transport passes until no occupant advances. */
export declare function resolveTransportRun<TState>(state: TState, options: TransportRunOptions<TState>): TransportRunResult<TState>;
export interface ComponentLink<TNode, TSource> {
    target: TNode;
    source: TSource;
}
export interface LinkedComponentOptions<TNode, TSource> {
    key(node: TNode): string;
    neighbors(node: TNode): Iterable<TNode>;
    member(node: TNode): boolean;
    sourceKey?(source: TSource): string;
}
/** Map every member of a connected target component to its incoming sources. */
export declare function buildLinkedComponentSources<TNode, TSource>(links: readonly ComponentLink<TNode, TSource>[], options: LinkedComponentOptions<TNode, TSource>): Map<string, TSource[]>;
export interface InterlockOptions<TState> {
    maxCycles: number;
    /** Settle transport/environment motion for this cycle. */
    settle(state: TState, cycle: number): void;
    /** Recompute linked state; true means another settle cycle is required. */
    update(state: TState, cycle: number): boolean;
}
export interface InterlockResult<TState> {
    state: TState;
    cycles: number;
    stabilized: boolean;
}
/** Resolve transport and linked state together to the product's cycle bound. */
export declare function resolveInterlock<TState>(state: TState, options: InterlockOptions<TState>): InterlockResult<TState>;
