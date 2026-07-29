export interface StarThresholds {
    three: number;
    two: number;
}
export interface AIActionLimitUsage {
    actionsUsed: number;
    maxActions: number;
}
/** A runtime guardrail, independent of product-defined resource costs. */
export declare function aiActionLimitExceeded(usage: AIActionLimitUsage): boolean;
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
export declare function scoreStars(actionsUsed: number, thresholds: StarThresholds): 1 | 2 | 3;
/**
 * @deprecated Use aiActionLimitExceeded and product-defined resources instead.
 * Preserves Energy-before-ActionBudget precedence for existing consumers.
 */
export declare function budgetFailure(usage: BudgetUsage): BudgetFailure | null;
/** Suggest authored star thresholds from a solver-derived minimum. */
export declare function suggestStarThresholds(minimumActions: number): StarThresholds;
