import type { Cell } from './movement.js';
/** Coordinate within a container: lattice cell, graph node key, or zone index. */
export type LocationCoord = Cell | string | number;
/** A location in a board, graph, or zone container. */
export interface LocationRef {
    container: string;
    coord: LocationCoord;
}
/**
 * Return a deterministic, collision-free key suitable for maps and transcripts.
 */
export declare function locationKey(ref: LocationRef): string;
