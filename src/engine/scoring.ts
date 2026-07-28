export interface StarThresholds {
  three: number;
  two: number;
}

export interface AIActionLimitUsage {
  actionsUsed: number;
  maxActions: number;
}

/** A runtime guardrail, independent of product-defined resource costs. */
export function aiActionLimitExceeded(usage: AIActionLimitUsage): boolean {
  return usage.actionsUsed >= usage.maxActions;
}

/** @deprecated Model energy with the resource transaction APIs instead. */
export interface BudgetUsage {
  actionsUsed: number;
  maxActions: number;
  energyUsed: number;
  energyCap: number;
}

/** @deprecated Use aiActionLimitExceeded and product-defined resources instead. */
export type BudgetFailure = 'out_of_energy' | 'out_of_action_budget';

/** Score a completed run from product-supplied action thresholds. */
export function scoreStars(actionsUsed: number, thresholds: StarThresholds): 1 | 2 | 3 {
  if (actionsUsed <= thresholds.three) return 3;
  if (actionsUsed <= thresholds.two) return 2;
  return 1;
}

/**
 * @deprecated Use aiActionLimitExceeded and product-defined resources instead.
 * Preserves Energy-before-ActionBudget precedence for existing consumers.
 */
export function budgetFailure(usage: BudgetUsage): BudgetFailure | null {
  if (usage.energyUsed >= usage.energyCap) return 'out_of_energy';
  if (usage.actionsUsed >= usage.maxActions) return 'out_of_action_budget';
  return null;
}

/** Suggest authored star thresholds from a solver-derived minimum. */
export function suggestStarThresholds(minimumActions: number): StarThresholds {
  return {
    three: Math.ceil(minimumActions * 1.34),
    two: Math.ceil(minimumActions * 1.85),
  };
}
