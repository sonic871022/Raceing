import type { Cell } from './movement.js';
export type CardinalDirection = 'up' | 'down' | 'left' | 'right';
export declare const CARDINAL_VECTORS: Readonly<Record<CardinalDirection, Cell>>;
export declare const CARDINAL_STEPS: readonly Cell[];
export declare function manhattanDistance(a: Cell, b: Cell): number;
/** Cells on a Bresenham line, excluding the start and including the target. */
export declare function bresenhamLine(from: Cell, to: Cell): Cell[];
export interface ShortestGridPathOptions {
    width: number;
    height: number;
    start: Cell;
    goal: Cell;
    isBlocked: (cell: Cell) => boolean;
    /** Permit a blocked goal cell while still blocking intermediate cells. */
    allowBlockedGoal?: boolean;
    steps?: readonly Cell[];
}
export interface NearestReachableCellOptions {
    width: number;
    height: number;
    start: Cell;
    isBlocked: (cell: Cell) => boolean;
    /** Product-owned qualification rule for a reachable candidate cell. */
    qualifies: (cell: Cell) => boolean;
    steps?: readonly Cell[];
    /** Stable product-owned preference among equally near qualified cells. */
    compareEqualDistance?: (a: Cell, b: Cell) => number;
}
export interface ReachableCellPath<TCell = Cell> {
    goal: TCell;
    /** Shortest path excluding the start and including `goal`. */
    path: TCell[];
}
/** Shortest cardinal path, excluding the start and including the goal. */
export declare function shortestGridPath(options: ShortestGridPathOptions): Cell[];
/**
 * Find the nearest reachable cell accepted by a caller-supplied rule.
 *
 * The SDK owns traversal, shortest-path guarantees, and deterministic
 * equal-distance selection. Products retain all semantic policy by injecting
 * `qualifies` (for example firing range, line of sight, or interaction rules).
 */
export declare function nearestReachableCellPath(options: NearestReachableCellOptions): ReachableCellPath<Cell> | undefined;
/** Test line of sight; endpoints are visible even when they are blockers. */
export declare function lineOfSightClear(from: Cell, to: Cell, isBlocked: (cell: Cell) => boolean): boolean;
export interface ConeFieldOptions {
    from: Cell;
    direction: CardinalDirection;
    range: number;
    cellExists: (cell: Cell) => boolean;
    isBlocked: (cell: Cell) => boolean;
}
/** Widening cardinal cone with callback-driven board and blocker policy. */
export declare function coneFieldCells(options: ConeFieldOptions): Cell[];
