import { advanceTick, } from './contracts.js';
import { fnv1a } from './random.js';
function assertTick(tick, name) {
    if (!Number.isSafeInteger(tick) || tick < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}
function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/**
 * Shared replay/rollback action fold. Lockstep ticks prefer one atomic batch;
 * legacy action transcripts retain their original serial semantics.
 *
 * @internal
 */
export function applyCanonicalActions(reducer, state, actions, atomic) {
    if (atomic)
        return advanceTick(reducer, state, actions);
    let next = state;
    for (const action of actions)
        next = advanceTick(reducer, next, [action]);
    return next;
}
/**
 * Canonical total order: tick, seat id, then authored submission order.
 */
export function canonicalizeLockstepInputs(inputs) {
    if (!Array.isArray(inputs))
        throw new TypeError('lockstep inputs must be an array');
    return inputs.map((input, authoredOrder) => {
        if (!input || typeof input !== 'object')
            throw new TypeError('lockstep input must be an object');
        assertTick(input.tick, 'lockstep tick');
        if (typeof input.seat !== 'string' || input.seat.length === 0) {
            throw new TypeError('lockstep input seat must be a non-empty string');
        }
        if (!Array.isArray(input.actions))
            throw new TypeError('lockstep actions must be an array');
        return { input, authoredOrder };
    }).sort((a, b) => (a.input.tick - b.input.tick
        || compareStrings(a.input.seat, b.input.seat)
        || a.authoredOrder - b.authoredOrder)).map(({ input }) => ({
        tick: input.tick,
        seat: input.seat,
        actions: input.actions.map((action) => ({
            ...action,
            ...(action.targets ? {
                targets: action.targets.map((target) => ({
                    container: target.container,
                    coord: Array.isArray(target.coord) ? [...target.coord] : target.coord,
                })),
            } : {}),
        })),
    }));
}
/**
 * Fold canonical per-tick inputs over a rollback snapshot.
 *
 * Canonical reducers receive an empty input batch for all-wait ticks. Legacy
 * reducers may provide `applyEmptyTick`; otherwise empty ticks remain identity
 * steps for compatibility.
 */
export function resimulate(reducer, snapshotState, inputs, options = {}) {
    const ordered = canonicalizeLockstepInputs(inputs);
    const fromTick = options.fromTick ?? 0;
    assertTick(fromTick, 'fromTick');
    if (ordered.some(({ tick }) => tick < fromTick)) {
        throw new RangeError('lockstep input tick must not precede fromTick');
    }
    const finalInputTick = ordered.at(-1)?.tick ?? fromTick - 1;
    const throughTick = options.throughTick ?? finalInputTick;
    if (throughTick >= 0)
        assertTick(throughTick, 'throughTick');
    if (throughTick < finalInputTick) {
        throw new RangeError('throughTick must not precede the final input tick');
    }
    let state = snapshotState;
    let cursor = 0;
    for (let tick = fromTick; tick <= throughTick; tick++) {
        const start = cursor;
        while (cursor < ordered.length && ordered[cursor].tick === tick)
            cursor++;
        if (start === cursor) {
            if ('advance' in reducer)
                state = advanceTick(reducer, state, []);
            else if (options.applyEmptyTick)
                state = options.applyEmptyTick(state, tick);
            continue;
        }
        const tickActions = [];
        for (let inputIndex = start; inputIndex < cursor; inputIndex++) {
            const input = ordered[inputIndex];
            for (const action of input.actions) {
                if (action.seat !== undefined && action.seat !== input.seat) {
                    throw new TypeError(`action seat ${action.seat} contradicts lockstep envelope seat ${input.seat}`);
                }
                tickActions.push(action.seat === undefined
                    ? { ...action, seat: input.seat }
                    : action);
            }
        }
        state = applyCanonicalActions(reducer, state, tickActions, true);
    }
    return state;
}
/** Deterministic desync digest; products should inject canonical serialization. */
export function stateDigest(state, options = {}) {
    const serialized = (options.serialize ?? JSON.stringify)(state);
    if (typeof serialized !== 'string')
        throw new TypeError('state serializer must return a string');
    return (options.hash ?? fnv1a)(serialized);
}
