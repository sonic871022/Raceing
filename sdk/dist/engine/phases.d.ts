export interface PhaseDefinition<TState> {
    id: string;
    onExit?(state: TState, event: PhaseBoundaryEvent): void;
    onEnter?(state: TState, event: PhaseBoundaryEvent): void;
}
export interface PhaseState {
    index: number;
    /** One-based traversal count. */
    cycle: number;
}
export type PhaseBoundaryEvent = {
    type: 'phase.exited';
    phaseId: string;
    phaseIndex: number;
    cycle: number;
} | {
    type: 'phase.entered';
    phaseId: string;
    phaseIndex: number;
    cycle: number;
} | {
    type: 'phase.cycle-completed';
    cycle: number;
};
export interface PhaseAdvanceResult<TState> {
    state: TState;
    phase: PhaseState;
    events: readonly PhaseBoundaryEvent[];
}
export declare function createPhaseState<TState>(phases: readonly PhaseDefinition<TState>[], first?: number): PhaseState;
export declare function activePhase<TState>(phase: PhaseState, phases: readonly PhaseDefinition<TState>[]): PhaseDefinition<TState>;
/**
 * Run one authored phase transition. Hooks run exit, cycle boundary, then
 * enter; returned events use that same deterministic order.
 */
export declare function advancePhase<TState>(state: TState, phase: PhaseState, phases: readonly PhaseDefinition<TState>[]): PhaseAdvanceResult<TState>;
