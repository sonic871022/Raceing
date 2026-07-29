export function visibilityAllows(visibility, seat) {
    if (!visibility || typeof visibility !== 'object') {
        throw new TypeError('visibility must be an object');
    }
    switch (visibility.kind) {
        case 'public':
            return true;
        case 'hidden':
            return false;
        case 'seats':
            if (!Array.isArray(visibility.seats)
                || visibility.seats.some((candidate) => typeof candidate !== 'string')) {
                throw new TypeError('seat visibility must contain seat ids');
            }
            return visibility.seats.includes(seat);
        default:
            throw new TypeError('visibility kind must be public, seats, or hidden');
    }
}
function validateTeams(teams) {
    if (!Array.isArray(teams))
        throw new TypeError('teams must be an array');
    const ids = new Set();
    const seats = new Set();
    for (const team of teams) {
        if (!team || typeof team.id !== 'string' || team.id.length === 0) {
            throw new TypeError('team ids must be non-empty strings');
        }
        if (ids.has(team.id))
            throw new TypeError(`duplicate team id: ${team.id}`);
        ids.add(team.id);
        if (!Array.isArray(team.seats) || team.seats.length === 0
            || team.seats.some((seat) => typeof seat !== 'string' || seat.length === 0)) {
            throw new TypeError(`team ${team.id} must contain non-empty seat ids`);
        }
        for (const seat of team.seats) {
            if (seats.has(seat))
                throw new TypeError(`seat belongs to multiple teams: ${seat}`);
            seats.add(seat);
        }
    }
}
export function teamForSeat(teams, seat) {
    validateTeams(teams);
    const team = teams.find((candidate) => candidate.seats.includes(seat));
    return team ? { ...team, seats: [...team.seats] } : undefined;
}
/** Shared-vision set for a seat; an unteamed seat sees only itself. */
export function teamVisibility(teams, seat) {
    return {
        kind: 'seats',
        seats: teamForSeat(teams, seat)?.seats ?? [seat],
    };
}
/**
 * Expand a team ranking into the seat-ranked `Outcome` convention. Every
 * member receives its team's rank and optional score.
 */
export function outcomeForTeams(teams, ranking, reason) {
    validateTeams(teams);
    if (!Array.isArray(ranking) || ranking.length !== teams.length) {
        throw new TypeError('team ranking must contain every declared team exactly once');
    }
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const seen = new Set();
    const seats = [];
    for (const result of ranking) {
        if (!result || typeof result.teamId !== 'string' || !teamById.has(result.teamId)
            || seen.has(result.teamId)) {
            throw new TypeError('team ranking must reference unique declared team ids');
        }
        if (!Number.isSafeInteger(result.rank) || result.rank < 1) {
            throw new RangeError(`team ${result.teamId} rank must be a positive safe integer`);
        }
        if (result.score !== undefined && !Number.isFinite(result.score)) {
            throw new TypeError(`team ${result.teamId} score must be finite`);
        }
        seen.add(result.teamId);
        for (const seat of teamById.get(result.teamId).seats) {
            seats.push({
                seat,
                rank: result.rank,
                ...(result.score !== undefined ? { score: result.score } : {}),
            });
        }
    }
    return {
        kind: 'decided',
        ranking: seats,
        ...(reason !== undefined ? { reason } : {}),
    };
}
/** Create a standardized reveal record for observation/event streams. */
export function createInformationRevelation(id, value, visibility = { kind: 'public' }) {
    if (typeof id !== 'string' || id.length === 0) {
        throw new TypeError('information revelation id must be a non-empty string');
    }
    // Exercise runtime validation even for public/hidden variants.
    visibilityAllows(visibility, '__revelation_validation__');
    return { type: 'information.revealed', id, visibility, value };
}
/** Filter standardized reveal records for one seat without changing order. */
export function revelationsForSeat(revelations, seat) {
    if (!Array.isArray(revelations))
        throw new TypeError('revelations must be an array');
    return revelations.filter((revelation) => {
        if (!revelation || revelation.type !== 'information.revealed') {
            throw new TypeError('revelation records must use information.revealed');
        }
        return visibilityAllows(revelation.visibility, seat);
    }).map((revelation) => ({ ...revelation }));
}
function canonicalValue(value, seen) {
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'bigint')
            return value.toString();
        return value;
    }
    if (seen.has(value))
        throw new TypeError('partition values must not be cyclic');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
        result = value.map((entry) => canonicalValue(entry, seen));
    }
    else {
        result = Object.fromEntries(Object.keys(value)
            .sort()
            .filter((key) => value[key] !== undefined)
            .map((key) => [
            key,
            canonicalValue(value[key], seen),
        ]));
    }
    seen.delete(value);
    return result;
}
function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value, new Set()));
}
function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function redactZone(source, policy, seat, entryKey) {
    const count = source['count'];
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new TypeError('zone view count must be a non-negative safe integer');
    }
    const identityVisible = visibilityAllows(policy.identity(seat), seat);
    const orderVisible = visibilityAllows(policy.order(seat), seat);
    const { entries: sourceEntries, slots: sourceSlots, ordered: _sourceOrdered, ...aggregates } = source;
    const base = { ...aggregates, count: count };
    if (!identityVisible)
        return base;
    const entries = Array.isArray(sourceEntries)
        ? sourceEntries
        : Object.values(record(sourceSlots) ?? {}).filter((entry) => entry !== null);
    if (!orderVisible) {
        return {
            ...base,
            ...(entries.length > 0 ? { entries: [...entries].sort((a, b) => (compareStrings(entryKey(a), entryKey(b))
                    || compareStrings(canonicalJson(a), canonicalJson(b)))) } : {}),
        };
    }
    return {
        ...base,
        ...(Array.isArray(sourceEntries) ? { entries: [...entries] } : {}),
        ...(record(sourceSlots) ? { slots: { ...record(sourceSlots) } } : {}),
        ordered: true,
    };
}
function defaultEntityCell(entity) {
    const value = record(entity);
    if (!value || !('at' in value)) {
        throw new TypeError('board entities require an `at` field or entityCell adapter');
    }
    return value['at'];
}
function defaultShellEntity(_entity, at) {
    return { at, hidden: true };
}
function redactBoard(source, policy, seat, entityCell, shellEntity) {
    if (policy.hiddenEntityMode !== 'absent' && policy.hiddenEntityMode !== 'shell') {
        throw new TypeError('hiddenEntityMode must be absent or shell');
    }
    const result = { ...source };
    const visible = (cell) => policy.cellVisible(seat, cell);
    if (Array.isArray(source['cells'])) {
        result['cells'] = source['cells'].filter(visible);
    }
    if (Array.isArray(source['targetableCells'])) {
        result['targetableCells'] = source['targetableCells'].filter(visible);
    }
    const targeting = record(source['actionTargeting']);
    if (targeting) {
        result['actionTargeting'] = Object.fromEntries(Object.entries(targeting).map(([actionId, value]) => {
            const target = record(value);
            return [actionId, {
                    ...target,
                    targetableCells: Array.isArray(target?.['targetableCells'])
                        ? target['targetableCells'].filter(visible)
                        : [],
                }];
        }));
    }
    if (Array.isArray(source['entities'])) {
        result['entities'] = source['entities'].flatMap((entity) => {
            const at = entityCell(entity);
            if (visible(at))
                return [entity];
            return policy.hiddenEntityMode === 'shell' ? [shellEntity(entity, at)] : [];
        });
    }
    return result;
}
/**
 * Derive a conventional per-seat view without mutating the full observation.
 *
 * Unconfigured zones/boards remain public. Products with custom view schemas
 * may implement `TickReducer.viewFor` directly and still use the leak checker.
 */
export function deriveSeatView(fullView, policies, seat) {
    if (typeof seat !== 'string' || seat.length === 0) {
        throw new TypeError('seat must be a non-empty string');
    }
    if (policies.board && policies.boards) {
        throw new TypeError('use either board or boards visibility policies, not both');
    }
    const result = { ...fullView };
    const zones = record(fullView.zones);
    if (zones && policies.zones) {
        result['zones'] = Object.fromEntries(Object.entries(zones).map(([zoneId, zone]) => {
            const policy = policies.zones?.[zoneId];
            const source = record(zone);
            if (!policy || !source)
                return [zoneId, zone];
            return [zoneId, redactZone(source, policy, seat, policies.entryKey ?? ((entry) => canonicalJson(entry)))];
        }));
    }
    const grid = record(fullView.grid);
    const entityCell = policies.entityCell ?? (defaultEntityCell);
    const shellEntity = policies.shellEntity ?? (defaultShellEntity);
    if (grid && policies.board) {
        result['grid'] = redactBoard(grid, policies.board, seat, entityCell, shellEntity);
    }
    else if (grid && policies.boards) {
        result['grid'] = Object.fromEntries(Object.entries(grid).map(([boardId, board]) => {
            const policy = policies.boards?.[boardId];
            const source = record(board);
            return [boardId, policy && source
                    ? redactBoard(source, policy, seat, entityCell, shellEntity)
                    : board];
        }));
    }
    return result;
}
export class InformationLeakError extends Error {
    variant;
    constructor(variant, message = `hidden-state variant ${variant} changed the observation stream`) {
        super(message);
        this.variant = variant;
        this.name = 'InformationLeakError';
    }
}
/**
 * Assert that hidden-state permutations produce byte-identical observations.
 */
export function assertNoInformationLeak(options) {
    if (!Array.isArray(options.variants) || options.variants.length === 0) {
        throw new RangeError('information leak checks require at least one hidden-state variant');
    }
    const serialize = options.serialize ?? ((observation) => JSON.stringify(observation));
    const expected = serialize(options.observe(options.baseline));
    for (let index = 0; index < options.variants.length; index++) {
        if (serialize(options.observe(options.variants[index])) !== expected) {
            throw new InformationLeakError(index);
        }
    }
}
