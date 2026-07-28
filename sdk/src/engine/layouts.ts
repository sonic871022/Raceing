import {
  CARDINAL_STEPS,
  bresenhamLine,
  manhattanDistance,
  type ReachableCellPath,
} from './geometry.js';
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

function assertPositiveDimension(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function isCell(cell: unknown): cell is Cell {
  return Array.isArray(cell)
    && cell.length === 2
    && cell.every((value) => Number.isSafeInteger(value));
}

function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`;
}

/** Create a bounded square lattice layout. */
export function createSquareLayout(options: SquareLayoutOptions): BoardLayout<Cell> {
  assertPositiveDimension(options.width, 'square layout width');
  assertPositiveDimension(options.height, 'square layout height');
  const steps = options.steps ?? CARDINAL_STEPS;
  if (!Array.isArray(steps) || steps.length === 0 || steps.some((step) => !isCell(step))) {
    throw new TypeError('square layout steps must contain coordinate pairs');
  }
  const contains = (cell: Cell): boolean => isCell(cell)
    && cell[0] >= 0 && cell[1] >= 0
    && cell[0] < options.width && cell[1] < options.height;
  return {
    contains,
    key: cellKey,
    distance: manhattanDistance,
    line: bresenhamLine,
    neighbors(cell) {
      if (!contains(cell)) return [];
      return steps
        .map(([dx, dy]): Cell => [cell[0] + dx, cell[1] + dy])
        .filter(contains);
    },
  };
}

export interface HexAxialLayoutOptions {
  contains(cell: Cell): boolean;
}

const HEX_AXIAL_STEPS: readonly Cell[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function axialDistance(a: Cell, b: Cell): number {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function nearestAxial(q: number, r: number): Cell {
  const qBase = Math.floor(q);
  const rBase = Math.floor(r);
  let best: Cell | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let candidateQ = qBase - 1; candidateQ <= qBase + 2; candidateQ++) {
    for (let candidateR = rBase - 1; candidateR <= rBase + 2; candidateR++) {
      const candidateS = -candidateQ - candidateR;
      const s = -q - r;
      const distance = (candidateQ - q) ** 2
        + (candidateR - r) ** 2
        + (candidateS - s) ** 2;
      const candidate: Cell = [candidateQ, candidateR];
      if (distance < bestDistance - Number.EPSILON * 8
        || (Math.abs(distance - bestDistance) <= Number.EPSILON * 8
          && (best === undefined || cellKey(candidate) < cellKey(best)))) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best!;
}

function hexLine(from: Cell, to: Cell): Cell[] {
  const length = axialDistance(from, to);
  if (length === 0) return [];
  const cells: Cell[] = [];
  for (let step = 1; step <= length; step++) {
    const t = step / length;
    cells.push(nearestAxial(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ));
  }
  return cells;
}

/** Create an axial `(q, r)` hex layout with clockwise neighbor ordering. */
export function createHexAxialLayout(options: HexAxialLayoutOptions): BoardLayout<Cell> {
  if (!options || typeof options.contains !== 'function') {
    throw new TypeError('hex layout contains must be a function');
  }
  const contains = (cell: Cell): boolean => isCell(cell) && options.contains(cell);
  return {
    contains,
    key: cellKey,
    distance: axialDistance,
    line: hexLine,
    neighbors(cell) {
      if (!contains(cell)) return [];
      return HEX_AXIAL_STEPS
        .map(([dq, dr]): Cell => [cell[0] + dq, cell[1] + dr])
        .filter(contains);
    },
  };
}

export interface GraphLayoutOptions {
  nodes: readonly string[];
  /** Directed adjacency lists. Array order is the authored BFS order. */
  edges: Readonly<Record<string, readonly string[]>>;
}

/** Create a deterministic directed graph layout. */
export function createGraphLayout(options: GraphLayoutOptions): BoardLayout<string> {
  if (!options || !Array.isArray(options.nodes)
    || options.nodes.some((node) => typeof node !== 'string' || node.length === 0)) {
    throw new TypeError('graph layout nodes must be non-empty strings');
  }
  if (new Set(options.nodes).size !== options.nodes.length) {
    throw new TypeError('graph layout nodes must be unique');
  }
  if (!options.edges || typeof options.edges !== 'object' || Array.isArray(options.edges)) {
    throw new TypeError('graph layout edges must be an adjacency record');
  }
  const nodeSet = new Set(options.nodes);
  const adjacency = new Map<string, readonly string[]>();
  for (const node of options.nodes) {
    const neighbors = options.edges[node] ?? [];
    if (!Array.isArray(neighbors)
      || neighbors.some((neighbor) => typeof neighbor !== 'string' || !nodeSet.has(neighbor))) {
      throw new TypeError(`graph layout edges for ${node} must reference declared nodes`);
    }
    if (new Set(neighbors).size !== neighbors.length) {
      throw new TypeError(`graph layout edges for ${node} must be unique`);
    }
    adjacency.set(node, [...neighbors]);
  }
  for (const node of Object.keys(options.edges)) {
    if (!nodeSet.has(node)) throw new TypeError(`graph layout edges contain undeclared node ${node}`);
  }

  const pathBetween = (from: string, to: string): string[] => {
    if (!nodeSet.has(from) || !nodeSet.has(to) || from === to) return [];
    const previous = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]!;
      for (const next of adjacency.get(current) ?? []) {
        if (previous.has(next)) continue;
        previous.set(next, current);
        queue.push(next);
        if (next === to) {
          const path: string[] = [];
          let step: string | null = to;
          while (step !== null && step !== from) {
            path.unshift(step);
            step = previous.get(step) ?? null;
          }
          return path;
        }
      }
    }
    return [];
  };

  return {
    contains: (cell) => typeof cell === 'string' && nodeSet.has(cell),
    key: (cell) => cell,
    neighbors: (cell) => adjacency.get(cell) ?? [],
    distance(from, to) {
      if (from === to && nodeSet.has(from)) return 0;
      const path = pathBetween(from, to);
      return path.length === 0 ? Number.POSITIVE_INFINITY : path.length;
    },
    line: pathBetween,
  };
}

export interface ShortestPathOptions<TCell> {
  start: TCell;
  goal: TCell;
  isBlocked(cell: TCell): boolean;
  allowBlockedGoal?: boolean;
}

function reconstructPath<TCell>(
  layout: BoardLayout<TCell>,
  previous: ReadonlyMap<string, TCell | null>,
  start: TCell,
  goal: TCell,
): TCell[] {
  const startKey = layout.key(start);
  const path: TCell[] = [];
  let current: TCell | null = goal;
  while (current !== null && layout.key(current) !== startKey) {
    path.unshift(current);
    current = previous.get(layout.key(current)) ?? null;
  }
  return path;
}

/** Find a shortest layout path, excluding the start and including the goal. */
export function shortestPath<TCell>(
  layout: BoardLayout<TCell>,
  options: ShortestPathOptions<TCell>,
): TCell[] {
  if (!layout.contains(options.start) || !layout.contains(options.goal)) return [];
  const startKey = layout.key(options.start);
  const goalKey = layout.key(options.goal);
  if (startKey === goalKey) return [];
  const previous = new Map<string, TCell | null>([[startKey, null]]);
  const queue: TCell[] = [options.start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    for (const next of layout.neighbors(current)) {
      if (!layout.contains(next)) continue;
      const key = layout.key(next);
      if (previous.has(key)) continue;
      const isGoal = key === goalKey;
      if (options.isBlocked(next) && !(isGoal && options.allowBlockedGoal)) continue;
      previous.set(key, current);
      if (isGoal) return reconstructPath(layout, previous, options.start, next);
      queue.push(next);
    }
  }
  return [];
}

export interface NearestReachablePathOptions<TCell> {
  start: TCell;
  isBlocked(cell: TCell): boolean;
  qualifies(cell: TCell): boolean;
  compareEqualDistance?: (a: TCell, b: TCell) => number;
}

/** Find the nearest reachable qualifying cell, or `null` when none exists. */
export function nearestReachablePath<TCell>(
  layout: BoardLayout<TCell>,
  options: NearestReachablePathOptions<TCell>,
): ReachableCellPath<TCell> | null {
  if (!layout.contains(options.start)) return null;
  if (options.qualifies(options.start)) return { goal: options.start, path: [] };
  const startKey = layout.key(options.start);
  const previous = new Map<string, TCell | null>([[startKey, null]]);
  const queue: TCell[] = [options.start];
  let layerStart = 0;
  while (layerStart < queue.length) {
    const layerEnd = queue.length;
    for (let cursor = layerStart; cursor < layerEnd; cursor++) {
      const current = queue[cursor]!;
      for (const next of layout.neighbors(current)) {
        const key = layout.key(next);
        if (!layout.contains(next) || previous.has(key) || options.isBlocked(next)) continue;
        previous.set(key, current);
        queue.push(next);
      }
    }
    const goals = queue.slice(layerEnd).filter(options.qualifies);
    if (goals.length > 0) {
      const goal = options.compareEqualDistance
        ? [...goals].sort(options.compareEqualDistance)[0]!
        : goals[0]!;
      return {
        goal,
        path: reconstructPath(layout, previous, options.start, goal),
      };
    }
    layerStart = layerEnd;
  }
  return null;
}

/** Test line of sight while treating both endpoints as visible. */
export function lineOfSight<TCell>(
  layout: BoardLayout<TCell>,
  from: TCell,
  to: TCell,
  blocksSight: (cell: TCell) => boolean,
): boolean {
  if (!layout.contains(from) || !layout.contains(to)) return false;
  const targetKey = layout.key(to);
  for (const cell of layout.line(from, to)) {
    if (layout.key(cell) === targetKey) return true;
    if (blocksSight(cell)) return false;
  }
  return layout.key(from) === targetKey;
}

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
export function fieldCells<TCell>(
  layout: BoardLayout<TCell>,
  options: FieldOptions<TCell>,
): TCell[] {
  if (!Number.isFinite(options.range) || options.range < 0) {
    throw new RangeError('field range must be a non-negative finite number');
  }
  if (!layout.contains(options.from)) return [];
  const fromKey = layout.key(options.from);
  const seen = new Set<string>();
  return options.candidates.filter((cell) => {
    if (!layout.contains(cell)) return false;
    const key = layout.key(cell);
    if (key === fromKey || seen.has(key)) return false;
    seen.add(key);
    const distance = layout.distance(options.from, cell);
    return distance <= options.range
      && (options.includes?.(cell, distance) ?? true)
      && lineOfSight(layout, options.from, cell, options.blocksSight);
  });
}
