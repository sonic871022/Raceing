/**
 * Evaluate one product-defined behavior tree.
 *
 * Selectors return their first non-null child result. Conditions evaluate only
 * their selected branch; a false condition without an else branch returns
 * null. The product adapter retains all leaf action and condition policy.
 */
export function evaluateBehaviorTree(context, node, adapter) {
    const view = adapter.inspect(node);
    if (view.kind === 'selector') {
        for (const child of view.children) {
            const result = evaluateBehaviorTree(context, child, adapter);
            if (result !== null)
                return result;
        }
        return null;
    }
    if (view.kind === 'condition') {
        if (adapter.test(context, view.condition, node)) {
            return evaluateBehaviorTree(context, view.then, adapter);
        }
        return view.else == null
            ? null
            : evaluateBehaviorTree(context, view.else, adapter);
    }
    return adapter.evaluateLeaf(context, node);
}
