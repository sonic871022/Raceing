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
export function locationKey(ref: LocationRef): string {
  if (!ref || typeof ref !== 'object') throw new TypeError('location must be an object');
  if (typeof ref.container !== 'string' || ref.container.length === 0) {
    throw new TypeError('location container must be a non-empty string');
  }
  const coord = ref.coord;
  if (Array.isArray(coord)) {
    if (coord.length !== 2 || coord.some((value) => !Number.isSafeInteger(value))) {
      throw new TypeError('location cell coordinate must be a pair of safe integers');
    }
    return JSON.stringify([ref.container, 'cell', coord[0], coord[1]]);
  }
  if (typeof coord === 'number') {
    if (!Number.isSafeInteger(coord)) {
      throw new TypeError('numeric location coordinate must be a safe integer');
    }
    return JSON.stringify([ref.container, 'index', coord]);
  }
  if (typeof coord === 'string') {
    return JSON.stringify([ref.container, 'key', coord]);
  }
  throw new TypeError('location coordinate must be a cell, string, or number');
}
