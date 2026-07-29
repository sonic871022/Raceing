/**
 * Arbitrate snapshot-qualified resource claims. The default contests every
 * action sharing a resource; priority mode accepts lower priority values first
 * and uses authored order as the stable tie-break.
 */
export function arbitrateResourceClaims(claims, options = {}) {
    if (options.mode !== undefined && options.mode !== 'all-fail' && options.mode !== 'priority') {
        throw new TypeError('resource arbitration mode must be all-fail or priority');
    }
    const ids = new Set();
    const byResource = new Map();
    for (const entry of claims) {
        if (ids.has(entry.id))
            throw new Error(`duplicate resource claim id: ${entry.id}`);
        ids.add(entry.id);
        if (!Array.isArray(entry.resources)
            || entry.resources.some((resource) => typeof resource !== 'string' || resource.length === 0)) {
            throw new TypeError(`resource claim ${entry.id} resources must be non-empty strings`);
        }
        if (entry.priority !== undefined && !Number.isFinite(entry.priority)) {
            throw new TypeError(`resource claim ${entry.id} priority must be finite`);
        }
        for (const resource of new Set(entry.resources)) {
            const resourceClaims = byResource.get(resource) ?? [];
            resourceClaims.push(entry.id);
            byResource.set(resource, resourceClaims);
        }
    }
    const conflicts = new Map();
    const contestedIds = new Set();
    for (const resource of [...byResource.keys()].sort()) {
        const resourceClaims = byResource.get(resource);
        if (resourceClaims.length < 2)
            continue;
        conflicts.set(resource, [...resourceClaims]);
        for (const id of resourceClaims)
            contestedIds.add(id);
    }
    if ((options.mode ?? 'all-fail') === 'all-fail') {
        return {
            accepted: claims.filter(({ id }) => !contestedIds.has(id)),
            contested: claims.filter(({ id }) => contestedIds.has(id)),
            conflicts,
        };
    }
    const authoredOrder = new Map(claims.map((claim, index) => [claim.id, index]));
    const ordered = [...claims].sort((left, right) => ((left.priority ?? 0) - (right.priority ?? 0)
        || authoredOrder.get(left.id) - authoredOrder.get(right.id)));
    const claimed = new Set();
    const acceptedIds = new Set();
    for (const claim of ordered) {
        const resources = new Set(claim.resources);
        if ([...resources].some((resource) => claimed.has(resource)))
            continue;
        acceptedIds.add(claim.id);
        for (const resource of resources)
            claimed.add(resource);
    }
    return {
        accepted: claims.filter(({ id }) => acceptedIds.has(id)),
        contested: claims.filter(({ id }) => !acceptedIds.has(id)),
        conflicts,
    };
}
