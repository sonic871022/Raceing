import type { SubmittedAction, Reducer, TickView } from './contracts.js';
export interface SolveResult {
    min: number | null;
    capped: boolean;
    explored: number;
    actions: SubmittedAction[] | null;
}
export interface SolverOptions<TState> {
    maxActions: number;
    maxNodes?: number;
    seed?: number;
    /** Override state normalization when a runtime has other volatile fields. */
    stateKey?: (state: TState) => string;
    /** Override action enumeration for a custom observation surface. */
    actions?: (view: TickView<unknown, unknown>) => SubmittedAction[];
    /** Product policy can exclude actions that cannot help search, such as restart. */
    includeAction?: (action: SubmittedAction, view: TickView<unknown, unknown>) => boolean;
}
/** Enumerate standard no-parameter, indexed, board, and declarative-target actions. */
export declare function enumerateActions(view: TickView<unknown, unknown>): SubmittedAction[];
/** Breadth-first shortest-path solver over any deterministic reducer. */
export declare function solveLevel<TLevel, TState, TView extends TickView<unknown, unknown>>(reducer: Reducer<TLevel, TState, TView>, level: TLevel, options: SolverOptions<TState>): SolveResult;
/** @deprecated Renamed to `SolveResult`; this alias will be removed in v1.0. */
export type GridSolveResult = SolveResult;
/** @deprecated Renamed to `SolverOptions`; this alias will be removed in v1.0. */
export type GridSolverOptions<TState> = SolverOptions<TState>;
/** @deprecated Renamed to `enumerateActions`; this alias will be removed in v1.0. */
export declare const enumerateGridActions: typeof enumerateActions;
/** @deprecated Renamed to `solveLevel`; this alias will be removed in v1.0. */
export declare const solveGridLevel: typeof solveLevel;
