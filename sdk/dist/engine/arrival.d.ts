export interface ArrivalRule<TState, TArrival, TEvent> {
    /** Stable deterministic identity. */
    id: string;
    /** Lower values run first. Defaults to zero. */
    priority?: number;
    applies?(state: TState, arrival: TArrival): boolean;
    apply(state: TState, arrival: TArrival, events: TEvent[]): void;
}
/** Apply every eligible tile-entry rule in stable priority/id order. */
export declare function resolveArrival<TState, TArrival, TEvent>(state: TState, arrival: TArrival, rules: readonly ArrivalRule<TState, TArrival, TEvent>[], events: TEvent[]): string[];
