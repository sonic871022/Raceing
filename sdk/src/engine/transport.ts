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
export function proposeDirectedTransport<TOccupant extends DirectedTransportOccupant>(
  occupants: readonly TOccupant[],
  options: DirectedTransportOptions<TOccupant>,
): Mover[] {
  const movers: Mover[] = [];
  for (const occupant of occupants) {
    const direction = options.directionAt(occupant.at);
    if (!direction || (options.activeAt && !options.activeAt(occupant.at))) continue;
    const to: Cell = [occupant.at[0] + direction[0], occupant.at[1] + direction[1]];
    if (options.canEnter && !options.canEnter(occupant, to)) continue;
    movers.push({
      id: occupant.id,
      from: occupant.at,
      to,
      priority: occupant.priority,
      ...(occupant.footprint ? { footprint: occupant.footprint } : {}),
      ...(occupant.swapOk ? { swapOk: occupant.swapOk } : {}),
    });
  }
  return movers;
}

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
export function resolveTransportRun<TState>(
  state: TState,
  options: TransportRunOptions<TState>,
): TransportRunResult<TState> {
  if (!Number.isSafeInteger(options.maxPasses) || options.maxPasses < 1) {
    throw new RangeError('transport maxPasses must be a positive safe integer');
  }
  let passes = 0;
  let moves = 0;
  let lastMoved = 0;
  while (passes < options.maxPasses) {
    lastMoved = options.step(state, passes);
    if (!Number.isSafeInteger(lastMoved) || lastMoved < 0) {
      throw new RangeError('transport step result must be a non-negative safe integer');
    }
    if (lastMoved === 0) return { state, passes, moves, completed: true };
    const cumulativeMoves = moves + lastMoved;
    if (!Number.isSafeInteger(cumulativeMoves)) {
      throw new RangeError('transport cumulative moves must be a safe integer');
    }
    moves = cumulativeMoves;
    passes += 1;
  }
  return { state, passes, moves, completed: lastMoved === 0 };
}

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
export function buildLinkedComponentSources<TNode, TSource>(
  links: readonly ComponentLink<TNode, TSource>[],
  options: LinkedComponentOptions<TNode, TSource>,
): Map<string, TSource[]> {
  const result = new Map<string, TSource[]>();
  for (const link of links) {
    if (!options.member(link.target)) continue;
    const pending = [link.target];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const node = pending.pop()!;
      const key = options.key(node);
      if (seen.has(key) || !options.member(node)) continue;
      seen.add(key);
      const sources = result.get(key) ?? [];
      const sourceKey = options.sourceKey?.(link.source);
      if (sourceKey === undefined
        ? !sources.includes(link.source)
        : !sources.some((source) => options.sourceKey!(source) === sourceKey)) {
        sources.push(link.source);
      }
      result.set(key, sources);
      for (const neighbor of options.neighbors(node)) pending.push(neighbor);
    }
  }
  return result;
}

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
export function resolveInterlock<TState>(
  state: TState,
  options: InterlockOptions<TState>,
): InterlockResult<TState> {
  if (!Number.isSafeInteger(options.maxCycles) || options.maxCycles < 1) {
    throw new RangeError('interlock maxCycles must be a positive safe integer');
  }
  for (let cycle = 0; cycle < options.maxCycles; cycle++) {
    options.settle(state, cycle);
    if (!options.update(state, cycle)) return { state, cycles: cycle + 1, stabilized: true };
  }
  return { state, cycles: options.maxCycles, stabilized: false };
}
