/** Convert occupants resting on active directed cells into movement proposals. */
export function proposeDirectedTransport(occupants, options) {
    const movers = [];
    for (const occupant of occupants) {
        const direction = options.directionAt(occupant.at);
        if (!direction || (options.activeAt && !options.activeAt(occupant.at)))
            continue;
        const to = [occupant.at[0] + direction[0], occupant.at[1] + direction[1]];
        if (options.canEnter && !options.canEnter(occupant, to))
            continue;
        movers.push({
            id: occupant.id,
            from: occupant.at,
            to,
            priority: occupant.priority,
            ...(occupant.footprint ? { footprint: occupant.footprint } : {}),
            ...(occupant.swapOk ? { swapOk: occupant.swapOk } : {}),
        });
    }
    return movers;
}
/** Repeat simultaneous directed-transport passes until no occupant advances. */
export function resolveTransportRun(state, options) {
    if (!Number.isSafeInteger(options.maxPasses) || options.maxPasses < 1) {
        throw new RangeError('transport maxPasses must be a positive safe integer');
    }
    let passes = 0;
    let moves = 0;
    let lastMoved = 0;
    while (passes < options.maxPasses) {
        lastMoved = options.step(state, passes);
        if (!Number.isSafeInteger(lastMoved) || lastMoved < 0) {
            throw new RangeError('transport step result must be a non-negative safe integer');
        }
        if (lastMoved === 0)
            return { state, passes, moves, completed: true };
        const cumulativeMoves = moves + lastMoved;
        if (!Number.isSafeInteger(cumulativeMoves)) {
            throw new RangeError('transport cumulative moves must be a safe integer');
        }
        moves = cumulativeMoves;
        passes += 1;
    }
    return { state, passes, moves, completed: lastMoved === 0 };
}
/** Map every member of a connected target component to its incoming sources. */
export function buildLinkedComponentSources(links, options) {
    const result = new Map();
    for (const link of links) {
        if (!options.member(link.target))
            continue;
        const pending = [link.target];
        const seen = new Set();
        while (pending.length > 0) {
            const node = pending.pop();
            const key = options.key(node);
            if (seen.has(key) || !options.member(node))
                continue;
            seen.add(key);
            const sources = result.get(key) ?? [];
            const sourceKey = options.sourceKey?.(link.source);
            if (sourceKey === undefined
                ? !sources.includes(link.source)
                : !sources.some((source) => options.sourceKey(source) === sourceKey)) {
                sources.push(link.source);
            }
            result.set(key, sources);
            for (const neighbor of options.neighbors(node))
                pending.push(neighbor);
        }
    }
    return result;
}
/** Resolve transport and linked state together to the product's cycle bound. */
export function resolveInterlock(state, options) {
    if (!Number.isSafeInteger(options.maxCycles) || options.maxCycles < 1) {
        throw new RangeError('interlock maxCycles must be a positive safe integer');
    }
    for (let cycle = 0; cycle < options.maxCycles; cycle++) {
        options.settle(state, cycle);
        if (!options.update(state, cycle))
            return { state, cycles: cycle + 1, stabilized: true };
    }
    return { state, cycles: options.maxCycles, stabilized: false };
}
