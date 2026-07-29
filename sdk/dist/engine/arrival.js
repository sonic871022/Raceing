const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
/** Apply every eligible tile-entry rule in stable priority/id order. */
export function resolveArrival(state, arrival, rules, events) {
    const applied = [];
    const ordered = [...rules].sort((left, right) => ((left.priority ?? 0) - (right.priority ?? 0)
        || compareText(left.id, right.id)));
    for (const rule of ordered) {
        if (rule.applies && !rule.applies(state, arrival))
            continue;
        rule.apply(state, arrival, events);
        applied.push(rule.id);
    }
    return applied;
}
