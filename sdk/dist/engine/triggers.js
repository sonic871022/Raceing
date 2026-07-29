/**
 * Fire every currently armed trigger in authored order.
 *
 * Each id is latched before its effects run. Conditions are evaluated against
 * the current state, so later triggers observe effects applied earlier in the
 * same pass.
 */
export function resolveLatchedTriggers(state, triggers, options) {
    const fired = [];
    for (const trigger of triggers) {
        if (options.isLatched(state, trigger.id))
            continue;
        if (!options.conditionMet(state, trigger.condition, trigger))
            continue;
        options.latch(state, trigger.id, trigger);
        for (const effect of trigger.effects) {
            options.applyEffect(state, effect, trigger);
        }
        fired.push(trigger.id);
    }
    return fired;
}
