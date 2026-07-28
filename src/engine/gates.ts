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
export function resolveGateTransition(input: GateTransitionInput): GateTransitionResult {
  if (input.state === 'closed' && input.active) {
    return { state: 'open', changed: true, transition: 'opened' };
  }
  if (input.mode === 'automatic'
    && input.state === 'open'
    && !input.active
    && !input.occupied) {
    return { state: 'closed', changed: true, transition: 'closed' };
  }
  return { state: input.state, changed: false, transition: null };
}
