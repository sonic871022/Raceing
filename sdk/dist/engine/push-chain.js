/** Plan an all-or-nothing linear push without mutating product state. */
export function planPushChain(start, direction, options) {
    if (!Number.isSafeInteger(options.maxItems) || options.maxItems < 0) {
        throw new RangeError('push-chain maxItems must be a non-negative safe integer');
    }
    const steps = [];
    let current = start;
    while (options.occupied(current)) {
        if (options.skip?.(current))
            return steps;
        if (steps.length >= options.maxItems)
            return null;
        const destination = options.destination(current, direction);
        if (options.blocked(destination))
            return null;
        steps.push({
            from: current,
            to: destination.to,
            ...(destination.metadata !== undefined ? { metadata: destination.metadata } : {}),
        });
        current = destination.to;
    }
    return steps;
}
/** Commit a legal push chain with deterministic mutation and arrival ordering. */
export function commitPushChain(steps, committer) {
    for (const step of [...steps].reverse())
        committer.move(step);
    for (const step of steps)
        committer.arrive(step);
}
