export interface LatchedTrigger<TCondition, TEffect> {
  /** Stable identity persisted by the product once this trigger fires. */
  id: string;
  condition: TCondition;
  effects: readonly TEffect[];
}

export interface LatchedTriggerOptions<TState, TCondition, TEffect> {
  isLatched(state: TState, id: string): boolean;
  conditionMet(
    state: TState,
    condition: TCondition,
    trigger: LatchedTrigger<TCondition, TEffect>,
  ): boolean;
  latch(
    state: TState,
    id: string,
    trigger: LatchedTrigger<TCondition, TEffect>,
  ): void;
  applyEffect(
    state: TState,
    effect: TEffect,
    trigger: LatchedTrigger<TCondition, TEffect>,
  ): void;
}

/**
 * Fire every currently armed trigger in authored order.
 *
 * Each id is latched before its effects run. Conditions are evaluated against
 * the current state, so later triggers observe effects applied earlier in the
 * same pass.
 */
export function resolveLatchedTriggers<TState, TCondition, TEffect>(
  state: TState,
  triggers: readonly LatchedTrigger<TCondition, TEffect>[],
  options: LatchedTriggerOptions<TState, TCondition, TEffect>,
): string[] {
  const fired: string[] = [];
  for (const trigger of triggers) {
    if (options.isLatched(state, trigger.id)) continue;
    if (!options.conditionMet(state, trigger.condition, trigger)) continue;
    options.latch(state, trigger.id, trigger);
    for (const effect of trigger.effects) {
      options.applyEffect(state, effect, trigger);
    }
    fired.push(trigger.id);
  }
  return fired;
}
