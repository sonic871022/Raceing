import { type ReachableCellPath } from './geometry.js';
import type { Cell } from './movement.js';
export interface BoardLayout<TCell = Cell> {
    /** Deterministically ordered neighbors. Order is part of the layout contract. */
    neighbors(cell: TCell): readonly TCell[];
    distance(a: TCell, b: TCell): number;
    /** Cells from `from` (exclusive) to `to` (inclusive). */
    line(from: TCell, to: TCell): readonly TCell[];
    contains(cell: TCell): boolean;
    key(cell: TCell): string;
}
export interface SquareLayoutOptions {
    width: number;
    height: number;
    steps?: readonly Cell[];
}
/** Create a bounded square lattice layout. */
export declare function createSquareLayout(options: SquareLayoutOptions): BoardLayout<Cell>;
export interface HexAxialLayoutOptions {
    contains(cell: Cell): boolean;
}
/** Create an axial `(q, r)` hex layout with clockwise neighbor ordering. */
export declare function createHexAxialLayout(options: HexAxialLayoutOptions): BoardLayout<Cell>;
export interface GraphLayoutOptions {
    nodes: readonly string[];
    /** Directed adjacency lists. Array order is the authored BFS order. */
    edges: Readonly<Record<string, readonly string[]>>;
}
/** Create a deterministic directed graph layout. */
export declare function createGraphLayout(options: GraphLayoutOptions): BoardLayout<string>;
export interface ShortestPathOptions<TCell> {
    start: TCell;
    goal: TCell;
    isBlocked(cell: TCell): boolean;
    allowBlockedGoal?: boolean;
}
/** Find a shortest layout path, excluding the start and including the goal. */
export declare function shortestPath<TCell>(layout: BoardLayout<TCell>, options: ShortestPathOptions<TCell>): TCell[];
export interface NearestReachablePathOptions<TCell> {
    start: TCell;
    isBlocked(cell: TCell): boolean;
    qualifies(cell: TCell): boolean;
    compareEqualDistance?: (a: TCell, b: TCell) => number;
}
/** Find the nearest reachable qualifying cell, or `null` when none exists. */
export declare function nearestReachablePath<TCell>(layout: BoardLayout<TCell>, options: NearestReachablePathOptions<TCell>): ReachableCellPath<TCell> | null;
/** Test line of sight while treating both endpoints as visible. */
export declare function lineOfSight<TCell>(layout: BoardLayout<TCell>, from: TCell, to: TCell, blocksSight: (cell: TCell) => boolean): boolean;
export interface FieldOptions<TCell> {
    from: TCell;
    /** Authored candidate order is preserved in the result. */
    candidates: readonly TCell[];
    range: number;
    blocksSight(cell: TCell): boolean;
    /** Optional shape policy for cones, arcs, or product-specific fields. */
    includes?: (cell: TCell, distance: number) => boolean;
}
/**
 * Filter authored candidates into a deterministic, range- and LOS-bounded field.
 */
export declare function fieldCells<TCell>(layout: BoardLayout<TCell>, options: FieldOptions<TCell>): TCell[];
