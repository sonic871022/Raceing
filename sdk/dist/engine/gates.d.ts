export type GateMode = 'latch' | 'automatic';
export type GateState = 'closed' | 'open';
export type GateTransition = 'opened' | 'closed' | null;
export interface GateTransitionInput {
    mode: GateMode;
    state: GateState;
    /** Whether any product-defined source currently activates the gate. */
    active: boolean;
    /** Automatic gates defer closing while their cell is occupied. */
    occupied?: boolean;
}
export interface GateTransitionResult {
    state: GateState;
    changed: boolean;
    transition: GateTransition;
}
/** Resolve one product-neutral gate state transition. */
export declare function resolveGateTransition(input: GateTransitionInput): GateTransitionResult;
