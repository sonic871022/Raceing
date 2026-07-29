function validateCommonMover(mover) {
    if (typeof mover.id !== 'string' || !mover.id.trim()) {
        throw new TypeError('mover id must be a non-empty string');
    }
    if (!Number.isFinite(mover.priority)) {
        throw new TypeError(`mover ${mover.id} priority must be finite`);
    }
    if (mover.occupies !== undefined && typeof mover.occupies !== 'function') {
        throw new TypeError(`mover ${mover.id} occupies must be a function`);
    }
    if (mover.swapOk && (!Array.isArray(mover.swapOk)
        || mover.swapOk.some((id) => typeof id !== 'string' || !id.trim()))) {
        throw new TypeError(`mover ${mover.id} swapOk must contain non-empty mover ids`);
    }
}
function assertUniqueMoverIds(movers) {
    if (new Set(movers.map((mover) => mover.id)).size !== movers.length) {
        throw new TypeError('mover ids must be unique');
    }
}
/**
 * Create a square-grid rectangular footprint function.
 */
export function rectFootprint(width, height) {
    if (!Number.isSafeInteger(width) || width < 1
        || !Number.isSafeInteger(height) || height < 1) {
        throw new RangeError('rectangular footprint must use positive safe integers');
    }
    return ([x, y]) => {
        const cells = [];
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++)
                cells.push([x + dx, y + dy]);
        }
        return cells;
    };
}
/**
 * Resolve movement intents simultaneously over arbitrary keyed cells.
 *
 * Movement reversion is monotonic: blocked chains settle while rotations
 * remain legal. Destination contests use priority then mover id.
 */
export function resolveKeyedMoves(movers, options) {
    if (!options || typeof options.key !== 'function'
        || typeof options.isStaticBlocked !== 'function') {
        throw new TypeError('keyed move options require key and isStaticBlocked functions');
    }
    for (const mover of movers)
        validateCommonMover(mover);
    assertUniqueMoverIds(movers);
    const ids = movers.map((mover) => mover.id).sort();
    const sourceById = new Map(movers.map((mover) => [mover.id, mover]));
    const byId = new Map(ids.map((id) => [id, sourceById.get(id)]));
    const current = new Map(ids.map((id) => [id, byId.get(id).from]));
    const destination = new Map(ids.map((id) => [id, byId.get(id).to]));
    const priorities = new Map(ids.map((id) => [id, byId.get(id).priority]));
    const sourceKeys = new Map();
    const occupied = new Map();
    const validateOccupied = (id, cells) => {
        if (!Array.isArray(cells) || cells.length === 0) {
            throw new TypeError(`mover ${id} occupies must return at least one cell`);
        }
        const keys = cells.map((cell) => {
            const key = options.key(cell);
            if (typeof key !== 'string')
                throw new TypeError('cell keys must be strings');
            return key;
        });
        if (new Set(keys).size !== keys.length) {
            throw new TypeError(`mover ${id} occupies must not return duplicate cells`);
        }
        return cells;
    };
    for (const id of ids) {
        const mover = byId.get(id);
        const fromKey = options.key(mover.from);
        const toKey = options.key(mover.to);
        if (typeof fromKey !== 'string' || typeof toKey !== 'string') {
            throw new TypeError('cell keys must be strings');
        }
        sourceKeys.set(id, fromKey);
        occupied.set(id, {
            source: validateOccupied(id, mover.occupies?.(mover.from) ?? [mover.from]),
            target: validateOccupied(id, mover.occupies?.(mover.to) ?? [mover.to]),
        });
    }
    const moving = (id) => (options.key(destination.get(id)) !== sourceKeys.get(id));
    const revert = (id) => destination.set(id, current.get(id));
    const cellsAtDestination = (id) => (moving(id) ? occupied.get(id).target : occupied.get(id).source);
    const overlaps = (a, b) => {
        const keys = new Set(a.map(options.key));
        return b.some((cell) => keys.has(options.key(cell)));
    };
    while (true) {
        const stayers = ids.filter((id) => !moving(id));
        const toRevert = new Set();
        for (const id of ids) {
            if (!moving(id))
                continue;
            const targetCells = cellsAtDestination(id);
            if (targetCells.some((cell) => options.isStaticBlocked(cell, id))
                || stayers.some((otherId) => (otherId !== id
                    && overlaps(targetCells, occupied.get(otherId).source)))) {
                toRevert.add(id);
            }
        }
        if (toRevert.size > 0) {
            for (const id of toRevert)
                revert(id);
            continue;
        }
        for (const id of ids) {
            if (!moving(id))
                continue;
            const mover = byId.get(id);
            const targetCells = occupied.get(id).target;
            const swap = ids.find((otherId) => (otherId !== id
                && moving(otherId)
                && overlaps(targetCells, occupied.get(otherId).source)
                && overlaps(occupied.get(otherId).target, occupied.get(id).source)));
            if (swap) {
                const consented = mover.swapOk?.includes(swap)
                    || byId.get(swap)?.swapOk?.includes(id);
                if (!consented) {
                    toRevert.add(id);
                    toRevert.add(swap);
                }
            }
        }
        if (toRevert.size > 0) {
            for (const id of toRevert)
                revert(id);
            continue;
        }
        for (const id of ids) {
            if (!moving(id))
                continue;
            const targetCells = occupied.get(id).target;
            const rivals = ids.filter((otherId) => (otherId !== id
                && moving(otherId)
                && overlaps(targetCells, occupied.get(otherId).target)));
            if (rivals.length > 0) {
                const group = [id, ...rivals];
                const winner = group.reduce((a, b) => {
                    const priorityDelta = priorities.get(a) - priorities.get(b);
                    return priorityDelta < 0 || (priorityDelta === 0 && a <= b) ? a : b;
                });
                for (const member of group) {
                    if (member !== winner)
                        toRevert.add(member);
                }
            }
        }
        if (toRevert.size === 0)
            break;
        for (const id of toRevert)
            revert(id);
    }
    return destination;
}
function validateGridMover(mover) {
    for (const [label, cell] of [['from', mover.from], ['to', mover.to]]) {
        if (!Array.isArray(cell) || cell.length !== 2
            || cell.some((value) => !Number.isSafeInteger(value))) {
            throw new TypeError(`mover ${mover.id} ${label} must be a pair of safe integers`);
        }
    }
    if (mover.footprint && (!Number.isSafeInteger(mover.footprint.width) || mover.footprint.width < 1
        || !Number.isSafeInteger(mover.footprint.height) || mover.footprint.height < 1)) {
        throw new RangeError(`mover ${mover.id} footprint must use positive safe integers`);
    }
}
/**
 * Resolve square-grid movement intents through the generic keyed resolver.
 */
export function resolveMoves(movers, isStaticBlocked) {
    for (const mover of movers) {
        validateCommonMover(mover);
        validateGridMover(mover);
    }
    return resolveKeyedMoves(movers.map((mover) => ({
        id: mover.id,
        from: mover.from,
        to: mover.to,
        priority: mover.priority,
        ...(mover.footprint
            ? { occupies: rectFootprint(mover.footprint.width, mover.footprint.height) }
            : {}),
        ...(mover.swapOk ? { swapOk: mover.swapOk } : {}),
    })), {
        key: ([x, y]) => `${x},${y}`,
        isStaticBlocked: ([x, y], moverId) => isStaticBlocked(x, y, moverId),
    });
}
