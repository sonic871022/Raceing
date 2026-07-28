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

export type PhaseBoundaryEvent =
  | {
    type: 'phase.exited';
    phaseId: string;
    phaseIndex: number;
    cycle: number;
  }
  | {
    type: 'phase.entered';
    phaseId: string;
    phaseIndex: number;
    cycle: number;
  }
  | {
    type: 'phase.cycle-completed';
    cycle: number;
  };

export interface PhaseAdvanceResult<TState> {
  state: TState;
  phase: PhaseState;
  events: readonly PhaseBoundaryEvent[];
}

function validatePhases<TState>(phases: readonly PhaseDefinition<TState>[]): void {
  if (!Array.isArray(phases) || phases.length === 0
    || phases.some((phase) => !phase || typeof phase.id !== 'string' || phase.id.length === 0)
    || new Set(phases.map(({ id }) => id)).size !== phases.length) {
    throw new TypeError('phases must have unique non-empty ids');
  }
  for (const phase of phases) {
    if (phase.onEnter !== undefined && typeof phase.onEnter !== 'function') {
      throw new TypeError(`phase ${phase.id} onEnter must be a function`);
    }
    if (phase.onExit !== undefined && typeof phase.onExit !== 'function') {
      throw new TypeError(`phase ${phase.id} onExit must be a function`);
    }
  }
}

export function createPhaseState<TState>(
  phases: readonly PhaseDefinition<TState>[],
  first = 0,
): PhaseState {
  validatePhases(phases);
  if (!Number.isSafeInteger(first) || first < 0 || first >= phases.length) {
    throw new RangeError('first phase must index the authored phase list');
  }
  return { index: first, cycle: 1 };
}

export function activePhase<TState>(
  phase: PhaseState,
  phases: readonly PhaseDefinition<TState>[],
): PhaseDefinition<TState> {
  validatePhases(phases);
  if (!Number.isSafeInteger(phase.index)
    || phase.index < 0 || phase.index >= phases.length
    || !Number.isSafeInteger(phase.cycle) || phase.cycle < 1) {
    throw new RangeError('phase state is invalid');
  }
  return phases[phase.index]!;
}

/**
 * Run one authored phase transition. Hooks run exit, cycle boundary, then
 * enter; returned events use that same deterministic order.
 */
export function advancePhase<TState>(
  state: TState,
  phase: PhaseState,
  phases: readonly PhaseDefinition<TState>[],
): PhaseAdvanceResult<TState> {
  const current = activePhase(phase, phases);
  const events: PhaseBoundaryEvent[] = [];
  const exited: PhaseBoundaryEvent = {
    type: 'phase.exited',
    phaseId: current.id,
    phaseIndex: phase.index,
    cycle: phase.cycle,
  };
  current.onExit?.(state, exited);
  events.push(exited);

  const wraps = phase.index === phases.length - 1;
  const nextPhase: PhaseState = {
    index: wraps ? 0 : phase.index + 1,
    cycle: phase.cycle + (wraps ? 1 : 0),
  };
  if (wraps) {
    events.push({ type: 'phase.cycle-completed', cycle: phase.cycle });
  }
  const next = phases[nextPhase.index]!;
  const entered: PhaseBoundaryEvent = {
    type: 'phase.entered',
    phaseId: next.id,
    phaseIndex: nextPhase.index,
    cycle: nextPhase.cycle,
  };
  next.onEnter?.(state, entered);
  events.push(entered);
  return { state, phase: nextPhase, events };
}
