import { runSettlementCascade, } from './settlement.js';
/**
 * Resolve a deterministic breadth-first chain reaction within one tick.
 *
 * Newly triggered nodes run in the following wave. Discovery order is retained
 * within a wave, and stable node keys guarantee at-most-once activation.
 */
export function resolveChainReaction(state, seeds, options) {
    let order = 0;
    const job = (node) => ({
        kind: 'chain_reaction',
        key: options.key(node),
        node,
        priority: order++,
        policy: 'once',
    });
    return runSettlementCascade(state, seeds.map(job), (current, context) => {
        for (const triggered of options.react(state, current.node, {
            step: context.step,
            wave: context.wave,
        }))
            context.enqueue(job(triggered));
    }, { maxSteps: options.maxReactions });
}
