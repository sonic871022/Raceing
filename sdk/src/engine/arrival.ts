export interface ArrivalRule<TState, TArrival, TEvent> {
  /** Stable deterministic identity. */
  id: string;
  /** Lower values run first. Defaults to zero. */
  priority?: number;
  applies?(state: TState, arrival: TArrival): boolean;
  apply(state: TState, arrival: TArrival, events: TEvent[]): void;
}

const compareText = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

/** Apply every eligible tile-entry rule in stable priority/id order. */
export function resolveArrival<TState, TArrival, TEvent>(
  state: TState,
  arrival: TArrival,
  rules: readonly ArrivalRule<TState, TArrival, TEvent>[],
  events: TEvent[],
): string[] {
  const applied: string[] = [];
  const ordered = [...rules].sort((left, right) => (
    (left.priority ?? 0) - (right.priority ?? 0)
    || compareText(left.id, right.id)
  ));
  for (const rule of ordered) {
    if (rule.applies && !rule.applies(state, arrival)) continue;
    rule.apply(state, arrival, events);
    applied.push(rule.id);
  }
  return applied;
}
