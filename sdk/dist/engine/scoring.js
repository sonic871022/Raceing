/** A runtime guardrail, independent of product-defined resource costs. */
export function aiActionLimitExceeded(usage) {
    return usage.actionsUsed >= usage.maxActions;
}
/** Score a completed run from product-supplied action thresholds. */
export function scoreStars(actionsUsed, thresholds) {
    if (actionsUsed <= thresholds.three)
        return 3;
    if (actionsUsed <= thresholds.two)
        return 2;
    return 1;
}
/**
 * @deprecated Use aiActionLimitExceeded and product-defined resources instead.
 * Preserves Energy-before-ActionBudget precedence for existing consumers.
 */
export function budgetFailure(usage) {
    if (usage.energyUsed >= usage.energyCap)
        return 'out_of_energy';
    if (usage.actionsUsed >= usage.maxActions)
        return 'out_of_action_budget';
    return null;
}
/** Suggest authored star thresholds from a solver-derived minimum. */
export function suggestStarThresholds(minimumActions) {
    return {
        three: Math.ceil(minimumActions * 1.34),
        two: Math.ceil(minimumActions * 1.85),
    };
}
