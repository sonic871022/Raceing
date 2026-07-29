/** A grid cell in `[x, y]` coordinates. */
export type Cell = [number, number];
/** One simultaneous square-grid movement intent. */
export interface Mover {
    id: string;
    from: Cell;
    to: Cell;
    /** Lower values win contested destinations. */
    priority: number;
    /** Rectangular footprint from the top-left anchor. Defaults to 1x1. */
    footprint?: {
        width: number;
        height: number;
    };
    /** Mover ids with which a head-on two-cycle is explicitly allowed. */
    swapOk?: string[];
}
/** One simultaneous movement intent over an arbitrary keyed layout. */
export interface KeyedMover<TCell> {
    id: string;
    from: TCell;
    to: TCell;
    /** Lower values win contested destinations. */
    priority: number;
    /** Full occupied-cell set at an anchor. Defaults to the anchor alone. */
    occupies?(at: TCell): readonly TCell[];
    /** Mover ids with which a head-on two-cycle is explicitly allowed. */
    swapOk?: readonly string[];
}
export type MoveResolution<TCell> = Map<string, TCell>;
export interface KeyedMoveOptions<TCell> {
    key(cell: TCell): string;
    isStaticBlocked(cell: TCell, moverId?: string): boolean;
}
/**
 * Create a square-grid rectangular footprint function.
 */
export declare function rectFootprint(width: number, height: number): (at: Cell) => readonly Cell[];
/**
 * Resolve movement intents simultaneously over arbitrary keyed cells.
 *
 * Movement reversion is monotonic: blocked chains settle while rotations
 * remain legal. Destination contests use priority then mover id.
 */
export declare function resolveKeyedMoves<TCell>(movers: readonly KeyedMover<TCell>[], options: KeyedMoveOptions<TCell>): MoveResolution<TCell>;
/**
 * Resolve square-grid movement intents through the generic keyed resolver.
 */
export declare function resolveMoves(movers: Mover[], isStaticBlocked: (x: number, y: number, moverId?: string) => boolean): Map<string, Cell>;
