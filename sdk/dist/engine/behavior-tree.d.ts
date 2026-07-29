export type BehaviorTreeNodeView<TNode, TCondition> = {
    kind: 'selector';
    children: readonly TNode[];
} | {
    kind: 'condition';
    condition: TCondition;
    then: TNode;
    else?: TNode | null;
} | {
    kind: 'leaf';
};
export interface BehaviorTreeAdapter<TContext, TNode, TCondition, TResult> {
    /** Project an arbitrary product node schema into a reusable tree shape. */
    inspect(node: TNode): BehaviorTreeNodeView<TNode, TCondition>;
    test(context: TContext, condition: TCondition, node: TNode): boolean;
    evaluateLeaf(context: TContext, node: TNode): TResult | null;
}
/**
 * Evaluate one product-defined behavior tree.
 *
 * Selectors return their first non-null child result. Conditions evaluate only
 * their selected branch; a false condition without an else branch returns
 * null. The product adapter retains all leaf action and condition policy.
 */
export declare function evaluateBehaviorTree<TContext, TNode, TCondition, TResult>(context: TContext, node: TNode, adapter: BehaviorTreeAdapter<TContext, TNode, TCondition, TResult>): TResult | null;
