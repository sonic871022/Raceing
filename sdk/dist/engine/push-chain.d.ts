import type { Cell } from './movement.js';
export interface PushDestination<TMetadata = never> {
    to: Cell;
    metadata?: TMetadata;
}
export interface PushChainStep<TMetadata = never> extends PushDestination<TMetadata> {
    from: Cell;
}
export interface PushChainOptions<TMetadata = never> {
    /** Whether a movable item currently occupies this cell. */
    occupied(cell: Cell): boolean;
    /** Prepare an ordinary or mechanic-specific destination, such as a squeeze. */
    destination(from: Cell, direction: Cell): PushDestination<TMetadata>;
    /** Whether the prepared destination blocks the complete chain. */
    blocked(destination: PushDestination<TMetadata>): boolean;
    /** A separately moving item vacates this cell and ends the chain here. */
    skip?(cell: Cell): boolean;
    /** Product-derived cycle guard. */
    maxItems: number;
}
/** Plan an all-or-nothing linear push without mutating product state. */
export declare function planPushChain<TMetadata = never>(start: Cell, direction: Cell, options: PushChainOptions<TMetadata>): Array<PushChainStep<TMetadata>> | null;
export interface PushChainCommitter<TMetadata = never> {
    /** Move state farthest-first so destinations are vacated before writes. */
    move(step: PushChainStep<TMetadata>): void;
    /** Emit arrival/presentation nearest-first after every state move commits. */
    arrive(step: PushChainStep<TMetadata>): void;
}
/** Commit a legal push chain with deterministic mutation and arrival ordering. */
export declare function commitPushChain<TMetadata = never>(steps: readonly PushChainStep<TMetadata>[], committer: PushChainCommitter<TMetadata>): void;
