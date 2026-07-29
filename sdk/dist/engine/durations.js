function validateStatus(status) {
    if (!status || typeof status.id !== 'string' || status.id.length === 0) {
        throw new TypeError('timed status id must be a non-empty string');
    }
    if (!Number.isSafeInteger(status.authoredOrder) || status.authoredOrder < 0) {
        throw new RangeError(`status ${status.id} authoredOrder must be non-negative`);
    }
    const duration = status.duration;
    if (!duration || ![
        'until-phase-end',
        'rounds',
        'counters',
    ].includes(duration.kind)) {
        throw new TypeError(`status ${status.id} duration is invalid`);
    }
    if ('remaining' in duration
        && (!Number.isSafeInteger(duration.remaining) || duration.remaining < 1)) {
        throw new RangeError(`status ${status.id} remaining duration must be positive`);
    }
    if (duration.kind === 'until-phase-end' && duration.phaseId !== undefined
        && (typeof duration.phaseId !== 'string' || duration.phaseId.length === 0)) {
        throw new TypeError(`status ${status.id} phaseId must be a non-empty string`);
    }
}
function copyDuration(duration) {
    return { ...duration };
}
function copyStatus(status) {
    return { ...status, duration: copyDuration(status.duration) };
}
function compareStatuses(left, right) {
    return left.authoredOrder - right.authoredOrder
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}
/**
 * Advance scheduled durations at one explicit product boundary.
 * Simultaneous expiries are returned in authored order.
 */
export function advanceDurations(statuses, boundary) {
    if (!Array.isArray(statuses))
        throw new TypeError('timed statuses must be an array');
    if (!boundary || !['phase-end', 'round-end'].includes(boundary.kind)) {
        throw new TypeError('duration boundary is invalid');
    }
    if (boundary.kind === 'phase-end'
        && (typeof boundary.phaseId !== 'string' || boundary.phaseId.length === 0)) {
        throw new TypeError('phase-end boundary requires a phase id');
    }
    const active = [];
    const expired = [];
    for (const source of statuses) {
        validateStatus(source);
        const status = copyStatus(source);
        const duration = status.duration;
        let shouldExpire = false;
        if (duration.kind === 'until-phase-end' && boundary.kind === 'phase-end'
            && (duration.phaseId === undefined || duration.phaseId === boundary.phaseId)) {
            shouldExpire = true;
        }
        else if (duration.kind === 'rounds' && boundary.kind === 'round-end') {
            duration.remaining--;
            shouldExpire = duration.remaining === 0;
        }
        (shouldExpire ? expired : active).push(status);
    }
    return {
        active,
        expired: expired.sort(compareStatuses),
    };
}
/**
 * Spend counters on one status. Reaching zero expires it; unrelated statuses
 * remain untouched and the expired result follows authored ordering.
 */
export function spendStatusCounters(statuses, statusId, count = 1) {
    if (typeof statusId !== 'string' || statusId.length === 0) {
        throw new TypeError('status id must be a non-empty string');
    }
    if (!Number.isSafeInteger(count) || count < 1) {
        throw new RangeError('counter spend must be a positive safe integer');
    }
    const active = [];
    const expired = [];
    let found = false;
    for (const source of statuses) {
        validateStatus(source);
        const status = copyStatus(source);
        if (status.id !== statusId) {
            active.push(status);
            continue;
        }
        if (found)
            throw new TypeError(`timed status ids must be unique: ${statusId}`);
        found = true;
        if (status.duration.kind !== 'counters') {
            throw new TypeError(`status ${statusId} does not use counters`);
        }
        if (count > status.duration.remaining) {
            throw new RangeError(`counter spend exceeds status ${statusId} remaining counters`);
        }
        status.duration.remaining -= count;
        if (status.duration.remaining === 0)
            expired.push(status);
        else
            active.push(status);
    }
    if (!found)
        throw new RangeError(`unknown timed status: ${statusId}`);
    return { active, expired: expired.sort(compareStatuses) };
}
