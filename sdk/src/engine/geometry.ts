import type { Cell } from './movement.js';

export type CardinalDirection = 'up' | 'down' | 'left' | 'right';

export const CARDINAL_VECTORS: Readonly<Record<CardinalDirection, Cell>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const CARDINAL_STEPS: readonly Cell[] = [
  CARDINAL_VECTORS.up,
  CARDINAL_VECTORS.down,
  CARDINAL_VECTORS.left,
  CARDINAL_VECTORS.right,
];

export function manhattanDistance(a: Cell, b: Cell): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/** Cells on a Bresenham line, excluding the start and including the target. */
export function bresenhamLine(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = [];
  let [x, y] = from;
  const dx = Math.abs(to[0] - x);
  const dy = Math.abs(to[1] - y);
  const sx = x < to[0] ? 1 : -1;
  const sy = y < to[1] ? 1 : -1;
  let error = dx - dy;
  const maximumSteps = dx + dy + 1;
  for (let i = 0; i < maximumSteps; i++) {
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
    cells.push([x, y]);
    if (x === to[0] && y === to[1]) break;
  }
  return cells;
}

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
export function shortestGridPath(options: ShortestGridPathOptions): Cell[] {
  const { width, height, start, goal, isBlocked } = options;
  const steps = options.steps ?? CARDINAL_STEPS;
  const key = ([x, y]: Cell): string => `${x},${y}`;
  const previous = new Map<string, Cell | null>([[key(start), null]]);
  const queue: Cell[] = [start];
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor++]!;
    if (current[0] === goal[0] && current[1] === goal[1]) break;
    for (const [dx, dy] of steps) {
      const next: Cell = [current[0] + dx, current[1] + dy];
      if (next[0] < 0 || next[1] < 0 || next[0] >= width || next[1] >= height) continue;
      const nextKey = key(next);
      if (previous.has(nextKey)) continue;
      const isGoal = next[0] === goal[0] && next[1] === goal[1];
      if (isBlocked(next) && !(isGoal && options.allowBlockedGoal)) continue;
      previous.set(nextKey, current);
      queue.push(next);
    }
  }
  if (!previous.has(key(goal))) return [];
  const path: Cell[] = [];
  let current: Cell | null = goal;
  while (current && (current[0] !== start[0] || current[1] !== start[1])) {
    path.unshift(current);
    current = previous.get(key(current)) ?? null;
  }
  return path;
}

/**
 * Find the nearest reachable cell accepted by a caller-supplied rule.
 *
 * The SDK owns traversal, shortest-path guarantees, and deterministic
 * equal-distance selection. Products retain all semantic policy by injecting
 * `qualifies` (for example firing range, line of sight, or interaction rules).
 */
export function nearestReachableCellPath(
  options: NearestReachableCellOptions,
): ReachableCellPath<Cell> | undefined {
  const { width, height, start, isBlocked, qualifies } = options;
  const steps = options.steps ?? CARDINAL_STEPS;
  const key = ([x, y]: Cell): string => `${x},${y}`;
  const startKey = key(start);
  const previous = new Map<string, Cell | null>([[startKey, null]]);
  const queue: Cell[] = [start];
  if (qualifies(start)) return { goal: [...start] as Cell, path: [] };

  let layerStart = 0;
  while (layerStart < queue.length) {
    const layerEnd = queue.length;
    for (let cursor = layerStart; cursor < layerEnd; cursor++) {
      const current = queue[cursor]!;
      for (const [dx, dy] of steps) {
        const next: Cell = [current[0] + dx, current[1] + dy];
        if (next[0] < 0 || next[1] < 0 || next[0] >= width || next[1] >= height) continue;
        const nextKey = key(next);
        if (previous.has(nextKey) || isBlocked(next)) continue;
        previous.set(nextKey, current);
        queue.push(next);
      }
    }

    const goals = queue.slice(layerEnd).filter(qualifies);
    if (goals.length > 0) {
      const goal = options.compareEqualDistance
        ? [...goals].sort(options.compareEqualDistance)[0]!
        : goals[0]!;
      const path: Cell[] = [];
      let current: Cell | null = goal;
      while (current && key(current) !== startKey) {
        path.unshift(current);
        current = previous.get(key(current)) ?? null;
      }
      return { goal: [...goal] as Cell, path };
    }
    layerStart = layerEnd;
  }
  return undefined;
}

/** Test line of sight; endpoints are visible even when they are blockers. */
export function lineOfSightClear(
  from: Cell,
  to: Cell,
  isBlocked: (cell: Cell) => boolean,
): boolean {
  if (from[0] === to[0] && from[1] === to[1]) return true;
  for (const cell of bresenhamLine(from, to)) {
    if (cell[0] === to[0] && cell[1] === to[1]) return true;
    if (isBlocked(cell)) return false;
  }
  return true;
}

export interface ConeFieldOptions {
  from: Cell;
  direction: CardinalDirection;
  range: number;
  cellExists: (cell: Cell) => boolean;
  isBlocked: (cell: Cell) => boolean;
}

/** Widening cardinal cone with callback-driven board and blocker policy. */
export function coneFieldCells(options: ConeFieldOptions): Cell[] {
  if (!Number.isSafeInteger(options.range) || options.range < 0) {
    throw new RangeError('cone range must be a non-negative safe integer');
  }
  const [dx, dy] = CARDINAL_VECTORS[options.direction];
  const cells: Cell[] = [];
  for (let forward = 1; forward <= options.range; forward++) {
    for (let perpendicular = -(forward - 1); perpendicular <= forward - 1; perpendicular++) {
      const cell: Cell = [
        options.from[0] + dx * forward + dy * perpendicular,
        options.from[1] + dy * forward + dx * perpendicular,
      ];
      if (!options.cellExists(cell) || options.isBlocked(cell)) continue;
      if (lineOfSightClear(options.from, cell, options.isBlocked)) cells.push(cell);
    }
  }
  return cells;
}
