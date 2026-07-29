import type { BoardLayout } from './layouts.js';
export interface TokenRef<TCell = unknown> {
    id: string;
    /** Authored location; its layout key must equal the containing map key. */
    cell: TCell;
    [key: string]: unknown;
}
export interface PatternSpec<TCell, TToken extends TokenRef<TCell> = TokenRef<TCell>> {
    shape: {
        kind: 'run';
        minLength: number;
    } | {
        kind: 'motif';
        offsets: readonly TCell[];
    };
    matches(a: TToken, b: TToken): boolean;
    /**
     * Place a relative motif offset at an origin. Two-number tuple cells have a
     * built-in additive default; other coordinate types must provide this.
     */
    translate?: (origin: TCell, offset: TCell) => TCell;
}
export interface PatternMatch<TCell, TToken extends TokenRef<TCell> = TokenRef<TCell>> {
    cells: readonly TCell[];
    tokens: readonly TToken[];
}
/**
 * Find deterministic runs or relative motifs. Overlapping maximal matches are
 * reported independently.
 */
export declare function findPatterns<TCell, TToken extends TokenRef<TCell> = TokenRef<TCell>>(layout: BoardLayout<TCell>, occupied: ReadonlyMap<string, TToken>, spec: PatternSpec<TCell, TToken>): readonly PatternMatch<TCell, TToken>[];
