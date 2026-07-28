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
export function planPushChain<TMetadata = never>(
  start: Cell,
  direction: Cell,
  options: PushChainOptions<TMetadata>,
): Array<PushChainStep<TMetadata>> | null {
  if (!Number.isSafeInteger(options.maxItems) || options.maxItems < 0) {
    throw new RangeError('push-chain maxItems must be a non-negative safe integer');
  }
  const steps: Array<PushChainStep<TMetadata>> = [];
  let current: Cell = start;
  while (options.occupied(current)) {
    if (options.skip?.(current)) return steps;
    if (steps.length >= options.maxItems) return null;
    const destination = options.destination(current, direction);
    if (options.blocked(destination)) return null;
    steps.push({
      from: current,
      to: destination.to,
      ...(destination.metadata !== undefined ? { metadata: destination.metadata } : {}),
    });
    current = destination.to;
  }
  return steps;
}

export interface PushChainCommitter<TMetadata = never> {
  /** Move state farthest-first so destinations are vacated before writes. */
  move(step: PushChainStep<TMetadata>): void;
  /** Emit arrival/presentation nearest-first after every state move commits. */
  arrive(step: PushChainStep<TMetadata>): void;
}

/** Commit a legal push chain with deterministic mutation and arrival ordering. */
export function commitPushChain<TMetadata = never>(
  steps: readonly PushChainStep<TMetadata>[],
  committer: PushChainCommitter<TMetadata>,
): void {
  for (const step of [...steps].reverse()) committer.move(step);
  for (const step of steps) committer.arrive(step);
}
