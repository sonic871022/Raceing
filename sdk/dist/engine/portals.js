import { locationKey } from './locations.js';
function assertLocation(location, label) {
    try {
        locationKey(location);
    }
    catch (error) {
        throw new TypeError(`${label} is invalid`, { cause: error });
    }
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function capacityClaimKey(wave, location) {
    return `${wave}\u0000${locationKey(location)}`;
}
function orientEdges(edges) {
    if (!Array.isArray(edges))
        throw new TypeError('portal edges must be an array');
    const ids = new Set();
    const oriented = [];
    for (const [authoredOrder, edge] of edges.entries()) {
        if (!edge || typeof edge.id !== 'string' || edge.id.length === 0) {
            throw new TypeError('portal edge ids must be non-empty strings');
        }
        if (ids.has(edge.id))
            throw new TypeError(`duplicate portal edge id: ${edge.id}`);
        ids.add(edge.id);
        assertLocation(edge.from, `portal ${edge.id} from`);
        assertLocation(edge.to, `portal ${edge.id} to`);
        if (edge.priority !== undefined && !Number.isFinite(edge.priority)) {
            throw new TypeError(`portal ${edge.id} priority must be finite`);
        }
        oriented.push({ edge: { ...edge }, reversed: false, authoredOrder });
        if (edge.bidirectional) {
            oriented.push({
                edge: { ...edge, from: edge.to, to: edge.from },
                reversed: true,
                authoredOrder,
            });
        }
    }
    return oriented;
}
function destinationKind(state, entity, edge, policy) {
    const explicit = policy.destinationKind?.(state, entity, edge);
    if (explicit)
        return explicit;
    if (Array.isArray(edge.to.coord))
        return 'board';
    if (typeof edge.to.coord === 'number')
        return 'zone';
    if (policy.insertInto && !policy.placeOnto)
        return 'zone';
    if (policy.placeOnto && !policy.insertInto)
        return 'board';
    throw new TypeError(`portal ${edge.id} string destination requires destinationKind`);
}
function destinationFor(state, entity, edge, policy) {
    const kind = destinationKind(state, entity, edge, policy);
    if (kind === 'zone') {
        const insert = policy.insertInto;
        if (!insert)
            return undefined;
        let position;
        if (insert.mode === 'index' || insert.mode === 'slot') {
            if (typeof insert.pick !== 'function')
                return undefined;
            position = insert.pick(state, entity, edge);
            if ((insert.mode === 'index' && (!Number.isSafeInteger(position) || position < 0))
                || (insert.mode === 'slot'
                    && (typeof position !== 'string' || position.length === 0))) {
                return undefined;
            }
        }
        const to = {
            container: edge.to.container,
            coord: position ?? edge.to.coord,
        };
        assertLocation(to, `portal ${edge.id} destination`);
        return {
            to,
            adaptation: {
                kind: 'zone',
                mode: insert.mode,
                ...(position !== undefined ? { position } : {}),
            },
            // Top/bottom/index insertions contend for container capacity.
            claims: [{ container: to.container, coord: '__zone_capacity__' }],
        };
    }
    const at = policy.placeOnto ? policy.placeOnto(state, entity, edge) : edge.to.coord;
    if (at === null)
        return undefined;
    const to = { container: edge.to.container, coord: at };
    assertLocation(to, `portal ${edge.id} destination`);
    const occupiedCoords = policy.occupiesAt?.(entity, at) ?? [at];
    if (!Array.isArray(occupiedCoords) || occupiedCoords.length === 0)
        return undefined;
    const occupied = occupiedCoords.map((coord) => ({
        container: edge.to.container,
        coord,
    }));
    try {
        for (const location of occupied)
            assertLocation(location, `portal ${edge.id} occupied cell`);
    }
    catch {
        return undefined;
    }
    if (new Set(occupied.map(locationKey)).size !== occupied.length)
        return undefined;
    return {
        to,
        adaptation: { kind: 'board', occupied },
        claims: occupied,
    };
}
function edgeCandidates(state, entity, at, edgeId, oriented, policy) {
    const atKey = locationKey(at);
    return oriented.filter(({ edge }) => (locationKey(edge.from) === atKey
        && (edgeId === undefined || edge.id === edgeId)
        && policy.isActive(state, edge))).sort((left, right) => ((left.edge.priority ?? 0) - (right.edge.priority ?? 0)
        || left.authoredOrder - right.authoredOrder
        || Number(left.reversed) - Number(right.reversed)));
}
function rejectGroup(paths, group, code, message, rejected) {
    for (const path of paths) {
        if (path.group === group && !rejected.some(({ entrant }) => entrant === path.entrant)) {
            rejected.push({ entrant: path.entrant, code, message });
        }
    }
}
function capacityFor(state, key, sample, policy) {
    const value = policy.capacityAt?.(state, sample) ?? 1;
    if (value !== Number.POSITIVE_INFINITY
        && (!Number.isSafeInteger(value) || value < 0)) {
        throw new RangeError(`portal destination capacity for ${key} must be non-negative`);
    }
    return value;
}
function comparePath(left, right) {
    const a = left.steps[0];
    const b = right.steps[0];
    return a.wave - b.wave
        || a.edgePriority - b.edgePriority
        || a.edgeOrder - b.edgeOrder
        || a.entrantPriority - b.entrantPriority
        || a.entrantOrder - b.entrantOrder;
}
/**
 * Plan bounded, heterogeneous portal paths and arbitrate destination capacity
 * without mutating product state.
 */
export function planPortalTransits(state, entrants, edges, policy, options) {
    if (!policy || typeof policy.entityId !== 'function'
        || typeof policy.isActive !== 'function'
        || typeof policy.canTransit !== 'function') {
        throw new TypeError('portal policy requires entityId, isActive, and canTransit');
    }
    if (!options || !Number.isSafeInteger(options.maxPasses) || options.maxPasses < 1) {
        throw new RangeError('portal maxPasses must be a positive safe integer');
    }
    if (options.contention !== undefined
        && options.contention !== 'all-fail' && options.contention !== 'priority') {
        throw new TypeError('portal contention must be all-fail or priority');
    }
    if (!Array.isArray(entrants))
        throw new TypeError('portal entrants must be an array');
    const oriented = orientEdges(edges);
    const entityIds = new Set();
    const paths = [];
    const rejected = [];
    for (const [entrantOrder, entrant] of entrants.entries()) {
        if (!entrant || typeof entrant !== 'object')
            throw new TypeError('portal entrant must be an object');
        assertLocation(entrant.at, 'portal entrant location');
        const entityId = policy.entityId(entrant.entity);
        if (typeof entityId !== 'string' || entityId.length === 0) {
            throw new TypeError('portal entity ids must be non-empty strings');
        }
        if (entityIds.has(entityId)) {
            return {
                ok: false,
                code: 'duplicate_entity',
                message: `duplicate portal entity id: ${entityId}`,
                rejected,
                baseState: state,
            };
        }
        entityIds.add(entityId);
        if (entrant.group !== undefined
            && (typeof entrant.group !== 'string' || entrant.group.length === 0)) {
            throw new TypeError(`portal entrant ${entityId} group must be a non-empty string`);
        }
        if (entrant.edgeId !== undefined
            && (typeof entrant.edgeId !== 'string' || entrant.edgeId.length === 0)) {
            throw new TypeError(`portal entrant ${entityId} edgeId must be a non-empty string`);
        }
        if (entrant.priority !== undefined && !Number.isFinite(entrant.priority)) {
            throw new TypeError(`portal entrant ${entityId} priority must be finite`);
        }
        if (entrant.wave !== undefined
            && (!Number.isSafeInteger(entrant.wave) || entrant.wave < 0)) {
            throw new RangeError(`portal entrant ${entityId} wave must be non-negative`);
        }
        const group = entrant.group ?? `entity:${entityId}`;
        const visited = new Set([locationKey(entrant.at)]);
        const steps = [];
        const claimKeys = new Map();
        let current = entrant.at;
        let selectedEdgeId = entrant.edgeId;
        for (let pass = 0; pass < options.maxPasses; pass++) {
            const candidates = edgeCandidates(state, entrant.entity, current, selectedEdgeId, oriented, policy);
            if (pass === 0 && selectedEdgeId && candidates.length === 0) {
                rejected.push({
                    entrant,
                    code: 'unknown_edge',
                    message: `selected edge ${selectedEdgeId} is not active at the entrant location`,
                });
                break;
            }
            selectedEdgeId = undefined;
            const orientedEdge = candidates.find(({ edge }) => (policy.canTransit(state, entrant.entity, edge)));
            if (!orientedEdge) {
                if (pass === 0) {
                    rejected.push({
                        entrant,
                        code: candidates.length === 0 ? 'inactive' : 'transit_denied',
                        message: candidates.length === 0
                            ? 'no active portal edge at entrant location'
                            : 'portal policy denied transit',
                    });
                }
                break;
            }
            const destination = destinationFor(state, entrant.entity, orientedEdge.edge, policy);
            if (!destination) {
                rejected.push({
                    entrant,
                    code: 'invalid_destination',
                    message: `portal ${orientedEdge.edge.id} produced an invalid destination`,
                });
                break;
            }
            if (policy.canEnter && !policy.canEnter(state, entrant.entity, orientedEdge.edge, destination.to, destination.claims)) {
                rejected.push({
                    entrant,
                    code: 'destination_blocked',
                    message: `portal ${orientedEdge.edge.id} destination is blocked`,
                });
                break;
            }
            const toKey = locationKey(destination.to);
            if (visited.has(toKey)) {
                return {
                    ok: false,
                    code: 'cycle',
                    message: `portal cycle detected for entity ${entityId} at ${toKey}`,
                    rejected: [...rejected, { entrant, code: 'cycle', message: 'portal path cycles' }],
                    baseState: state,
                };
            }
            visited.add(toKey);
            const wave = (entrant.wave ?? 0) + pass;
            for (const claim of destination.claims) {
                const key = capacityClaimKey(wave, claim);
                claimKeys.set(key, (claimKeys.get(key) ?? 0) + 1);
            }
            steps.push({
                entityId,
                entity: entrant.entity,
                group,
                from: current,
                to: destination.to,
                edge: orientedEdge.edge,
                reversed: orientedEdge.reversed,
                pass,
                wave,
                edgePriority: orientedEdge.edge.priority ?? 0,
                edgeOrder: orientedEdge.authoredOrder,
                entrantPriority: entrant.priority ?? 0,
                entrantOrder,
                adaptation: destination.adaptation,
            });
            current = destination.to;
            const next = edgeCandidates(state, entrant.entity, current, undefined, oriented, policy)
                .some(({ edge }) => policy.canTransit(state, entrant.entity, edge));
            if (!next)
                break;
            if (pass === options.maxPasses - 1) {
                return {
                    ok: false,
                    code: 'pass_limit',
                    message: `portal path for entity ${entityId} exceeded maxPasses`,
                    rejected: [...rejected, {
                            entrant,
                            code: 'pass_limit',
                            message: 'portal path exceeded maxPasses',
                        }],
                    baseState: state,
                };
            }
        }
        if (steps.length > 0 && !rejected.some(({ entrant: candidate }) => candidate === entrant)) {
            paths.push({ entrant, entrantOrder, entityId, group, steps, claimKeys, state });
        }
    }
    // Any member failure rejects its complete declared group.
    for (const entry of [...rejected]) {
        const group = entry.entrant.group ?? `entity:${policy.entityId(entry.entrant.entity)}`;
        rejectGroup(paths, group, 'group_failed', `portal group ${group} failed atomically`, rejected);
    }
    const rejectedGroups = new Set(rejected.map(({ entrant }) => (entrant.group ?? `entity:${policy.entityId(entrant.entity)}`)));
    const candidates = paths.filter(({ group }) => !rejectedGroups.has(group));
    const groups = new Map();
    for (const path of candidates)
        groups.set(path.group, [...(groups.get(path.group) ?? []), path]);
    const sampleByClaim = new Map();
    for (const path of candidates) {
        for (const step of path.steps) {
            const claims = step.adaptation.kind === 'board'
                ? step.adaptation.occupied
                : [{ container: step.to.container, coord: '__zone_capacity__' }];
            for (const claim of claims) {
                sampleByClaim.set(capacityClaimKey(step.wave, claim), claim);
            }
        }
    }
    const acceptedGroups = new Set();
    if ((options.contention ?? 'all-fail') === 'all-fail') {
        const usage = new Map();
        for (const [group, members] of groups) {
            const groupClaims = new Map();
            for (const member of members) {
                for (const [key, count] of member.claimKeys) {
                    groupClaims.set(key, (groupClaims.get(key) ?? 0) + count);
                }
            }
            for (const [key, count] of groupClaims) {
                const current = usage.get(key) ?? { count: 0, groups: new Set() };
                current.count += count;
                current.groups.add(group);
                usage.set(key, current);
            }
        }
        const contested = new Set();
        for (const [key, use] of usage) {
            const capacity = capacityFor(state, key, sampleByClaim.get(key), policy);
            if (use.count > capacity)
                for (const group of use.groups)
                    contested.add(group);
        }
        for (const group of groups.keys()) {
            if (contested.has(group)) {
                rejectGroup(paths, group, 'contested', `portal group ${group} lost all-fail contention`, rejected);
            }
            else {
                acceptedGroups.add(group);
            }
        }
    }
    else {
        const used = new Map();
        const orderedGroups = [...groups.entries()].sort((left, right) => (comparePath([...left[1]].sort(comparePath)[0], [...right[1]].sort(comparePath)[0])
            || compareText(left[0], right[0])));
        for (const [group, members] of orderedGroups) {
            const claims = new Map();
            for (const member of members) {
                for (const [key, count] of member.claimKeys) {
                    claims.set(key, (claims.get(key) ?? 0) + count);
                }
            }
            const fits = [...claims].every(([key, count]) => ((used.get(key) ?? 0) + count
                <= capacityFor(state, key, sampleByClaim.get(key), policy)));
            if (!fits) {
                rejectGroup(paths, group, 'contested', `portal group ${group} lost priority contention`, rejected);
                continue;
            }
            acceptedGroups.add(group);
            for (const [key, count] of claims)
                used.set(key, (used.get(key) ?? 0) + count);
        }
    }
    const transits = candidates
        .filter(({ group }) => acceptedGroups.has(group))
        .flatMap(({ steps }) => steps)
        .sort((left, right) => (left.wave - right.wave
        || left.edgePriority - right.edgePriority
        || left.edgeOrder - right.edgeOrder
        || left.entrantPriority - right.entrantPriority
        || left.entrantOrder - right.entrantOrder
        || left.pass - right.pass));
    return { ok: true, transits, rejected, baseState: state };
}
/**
 * Transform every edge traversal exactly once, commit the complete batch,
 * then dispatch arrivals. No product mutation occurs for rejected entrants.
 */
export function commitPortalTransits(state, plan, policy, committer) {
    if (!plan || plan.ok !== true)
        throw new TypeError('successful portal plan is required');
    if (!Object.is(state, plan.baseState)) {
        return {
            ok: false,
            code: 'stale_plan',
            message: 'portal plan no longer matches its base state',
            rejected: [],
            baseState: state,
        };
    }
    if (!committer || typeof committer.commit !== 'function') {
        throw new TypeError('portal committer requires an atomic commit function');
    }
    const committedByTransit = new Map();
    // Transform in per-entity path order even when global settlement ordering interleaves entities.
    const perEntity = new Map();
    for (const transit of plan.transits) {
        perEntity.set(transit.entityId, [...(perEntity.get(transit.entityId) ?? []), transit]);
    }
    for (const [entityId, transits] of perEntity) {
        transits.sort((left, right) => left.pass - right.pass);
        let entity = transits[0].entity;
        for (const transit of transits) {
            entity = policy.transform?.(entity, transit.edge) ?? entity;
            const committed = { ...transit, committedEntity: entity };
            committedByTransit.set(transit, committed);
        }
    }
    const committed = plan.transits.map((transit) => committedByTransit.get(transit));
    const next = committer.commit(state, committed);
    for (const transit of committed)
        committer.arrive?.(next, transit);
    return { ok: true, state: next, transits: committed };
}
