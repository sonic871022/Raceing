function assertSeats(seats) {
    if (!Array.isArray(seats) || seats.length === 0
        || seats.some((seat) => typeof seat !== 'string' || seat.length === 0)
        || new Set(seats).size !== seats.length) {
        throw new TypeError('response-window seats must be unique non-empty strings');
    }
}
function assertWindow(window) {
    if (!window || typeof window !== 'object')
        throw new TypeError('response window is required');
    assertSeats(window.seats);
    if (!Number.isSafeInteger(window.priority)
        || window.priority < 0 || window.priority >= window.seats.length) {
        throw new RangeError('response-window priority must index seats');
    }
    if (!Number.isSafeInteger(window.consecutivePasses)
        || window.consecutivePasses < 0 || window.consecutivePasses > window.seats.length) {
        throw new RangeError('response-window consecutive passes are invalid');
    }
    if (!Number.isSafeInteger(window.nextSequence) || window.nextSequence < 0) {
        throw new RangeError('response-window sequence must be non-negative');
    }
}
function assertOpen(window, seat) {
    assertWindow(window);
    if (window.closed)
        throw new Error('response window is closed');
    if (window.seats[window.priority] !== seat) {
        throw new Error(`seat ${seat} does not hold response priority`);
    }
}
/** Open a response window with deterministic authored seat order. */
export function openResponseWindow(seats, first = 0, pending = []) {
    assertSeats(seats);
    if (!Number.isSafeInteger(first) || first < 0 || first >= seats.length) {
        throw new RangeError('first response priority must index seats');
    }
    if (!Array.isArray(pending)
        || pending.some(({ seat }) => typeof seat !== 'string' || seat.length === 0)) {
        throw new TypeError('pending responses require seat ids');
    }
    return {
        seats: [...seats],
        priority: first,
        consecutivePasses: 0,
        stack: pending.map((entry, sequence) => ({ sequence, ...entry })),
        passes: [],
        nextSequence: pending.length,
        closed: false,
    };
}
export function responsePrioritySeat(window) {
    assertWindow(window);
    return window.seats[window.priority];
}
/** A response enters the stack and resets the consecutive-pass count. */
export function submitResponse(window, seat, response) {
    assertOpen(window, seat);
    return {
        ...window,
        seats: [...window.seats],
        priority: (window.priority + 1) % window.seats.length,
        consecutivePasses: 0,
        stack: [...window.stack, {
                sequence: window.nextSequence,
                seat,
                response,
            }],
        passes: [...window.passes],
        nextSequence: window.nextSequence + 1,
    };
}
/**
 * Pass priority. The window closes after every seat passes consecutively;
 * timeouts are ordinary deterministic passes with an explicit reason.
 */
export function passResponsePriority(window, seat, reason = 'pass') {
    assertOpen(window, seat);
    if (!['pass', 'timeout', 'wait'].includes(reason)) {
        throw new TypeError('response pass reason is invalid');
    }
    const consecutivePasses = window.consecutivePasses + 1;
    return {
        ...window,
        seats: [...window.seats],
        priority: (window.priority + 1) % window.seats.length,
        consecutivePasses,
        stack: [...window.stack],
        passes: [...window.passes, {
                sequence: window.nextSequence,
                seat,
                reason,
            }],
        nextSequence: window.nextSequence + 1,
        closed: consecutivePasses === window.seats.length,
    };
}
export function timeoutResponsePriority(window) {
    return passResponsePriority(window, responsePrioritySeat(window), 'timeout');
}
/** Return the stack in LIFO resolution order after the window closes. */
export function unwindResponseWindow(window) {
    assertWindow(window);
    if (!window.closed)
        throw new Error('response window must close before it can unwind');
    return [...window.stack].reverse().map((entry) => ({ ...entry }));
}
/** Participation descriptor for the ordinary collection tick backing a window. */
export function responseWindowParticipation(window) {
    assertWindow(window);
    return {
        mode: 'sequential',
        activeSeat: responsePrioritySeat(window),
    };
}
