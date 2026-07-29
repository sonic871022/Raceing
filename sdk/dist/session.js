import { PROTOCOL_ID, PROTOCOL_VERSION, assertJsonValue, canonicalJson, collectIntent, createIntentWindow, isParticipantId, IntentCollectionError, makeTickId, validateIntentSubmission, } from './protocol.js';
export { IntentCollectionError };
export { createTickRate } from './engine/index.js';
import { COMMITMENT_SCHEME, GAOS_REPLAY_DERIVED_SEEDS, GAOS_TIMEOUT_POLICY_REF, SUBMISSION_SIGNATURE_SCHEME, advanceTick, assertCommitmentEnvelope, createCommitmentHash, createReplayArtifact, fnv1a, replayMetricsFor, runLevelSeed, sha256, signatureBytesFromBase64, submissionRosterHashV1, } from './engine/index.js';
import { applyJsonPatch, createBoundedValidatedJsonPatch, createJsonPatch, isJsonProjection, } from './observation-codec.js';
export { applyJsonPatch, createJsonPatch, isJsonProjection };
const preparedTransition = Symbol('gaos.prepared-transition');
export class PreparedTransitionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'PreparedTransitionError';
    }
}
export class SessionConflictError extends Error {
    code;
    constructor(codeOrMessage, message) {
        const code = message === undefined ? 'conflict' : codeOrMessage;
        super(message ?? codeOrMessage);
        this.name = 'SessionConflictError';
        this.code = code;
    }
}
export class SessionAdvanceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'SessionAdvanceError';
    }
}
const DEFAULT_LIMITS = Object.freeze({
    maxCatchUpTicks: 600,
    receiptRetention: 64,
    maxExtensionBytes: 65_536,
    checkpointInterval: 1,
    maxOpenCommitmentsPerSeat: 64,
});
const utf8Encoder = new TextEncoder();
function cloneMapValues(source) {
    return new Map([...source].map(([key, value]) => [key, structuredClone(value)]));
}
function forkInterestScopes(source) {
    return new Map([...source].map(([key, scope]) => [key, {
            ...scope,
            declaration: structuredClone(scope.declaration),
            // Views are derived immutable values. Drafts replace this reference rather
            // than mutating it, so sharing avoids a full graph clone per prepare call.
            view: scope.view,
        }]));
}
function actionCopy(action) {
    return structuredClone(action);
}
function isObjectRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isReplayTickTimeoutPolicy(value) {
    return isObjectRecord(value)
        && value.mode === 'ticks'
        && Number.isSafeInteger(value.windowTicks)
        && value.windowTicks > 0
        && Object.keys(value).every((key) => key === 'mode' || key === 'windowTicks');
}
function deepFreeze(value, maximumObjects = 100_000) {
    if (value === null || typeof value !== 'object')
        return value;
    const pending = [value];
    const visited = new WeakSet();
    let visitedObjects = 0;
    while (pending.length > 0) {
        const current = pending.pop();
        if (visited.has(current))
            continue;
        visited.add(current);
        visitedObjects++;
        if (visitedObjects > maximumObjects) {
            throw new RangeError('prepared value exceeds the deep-freeze object limit');
        }
        for (const child of Object.values(current)) {
            if (child !== null && typeof child === 'object')
                pending.push(child);
        }
        Object.freeze(current);
    }
    return value;
}
function participantsForView(view, fallback) {
    if (view.participation?.mode === 'sequential') {
        return [view.participation.activeSeat];
    }
    if (view.participation?.mode === 'simultaneous') {
        return [...view.participation.seats];
    }
    if (view.activeSeat)
        return [view.activeSeat];
    return [...fallback];
}
function receiptKey(participantId, submissionId) {
    return `${participantId}\u0000${submissionId}`;
}
function interestScopeKey(participantId, scopeId) {
    return `${participantId}\u0000${scopeId}`;
}
function commitmentKey(seat, commitmentId) {
    return `${seat}\u0000${commitmentId}`;
}
function eventId(sessionId, transitionRevision, index) {
    return `${sessionId}:${transitionRevision}:${index}`;
}
function viewDigest(view) {
    return fnv1a(canonicalSessionView(view));
}
/** Reconstruct and digest-check one v2 observation envelope. */
export function applyObservationDelta(previous, delta) {
    let next;
    if (delta.body.kind === 'snapshot') {
        next = structuredClone(delta.body.view);
    }
    else if (delta.body.kind === 'unchanged') {
        if (previous === undefined)
            throw new TypeError('unchanged delta requires a prior view');
        next = structuredClone(previous);
    }
    else {
        if (previous === undefined)
            throw new TypeError('patch delta requires a prior view');
        next = applyJsonPatch(previous, delta.body.operations);
    }
    if (viewDigest(next) !== delta.viewDigest) {
        throw new SessionAdvanceError('invalid_view', 'observation delta digest mismatch');
    }
    return next;
}
/**
 * Client-side optimistic reconciliation over authoritative observation
 * deltas. Pending commands always replay in original local enqueue order.
 */
export class PredictionSession {
    options;
    authoritative;
    predicted;
    transitionRevision;
    authoritativeViewRevision;
    pendingSubmissions = [];
    constructor(options) {
        this.options = options;
        if (!isObjectRecord(options) || typeof options.applyPending !== 'function') {
            throw new TypeError('PredictionSession requires an applyPending function');
        }
        if (options.initial !== undefined) {
            if (!Number.isSafeInteger(options.initial.transitionRevision)
                || options.initial.transitionRevision < 0
                || !Number.isSafeInteger(options.initial.viewRevision)
                || options.initial.viewRevision < 0) {
                throw new RangeError('PredictionSession initial revisions must be non-negative integers');
            }
            this.authoritative = structuredClone(options.initial.view);
            this.predicted = structuredClone(options.initial.view);
            this.transitionRevision = options.initial.transitionRevision;
            this.authoritativeViewRevision = options.initial.viewRevision;
        }
    }
    predict(submission) {
        if (this.predicted === undefined) {
            throw new SessionAdvanceError('invalid_view', 'prediction requires an authoritative snapshot');
        }
        if (!isObjectRecord(submission)
            || typeof submission.participantId !== 'string'
            || !submission.participantId
            || typeof submission.submissionId !== 'string'
            || !submission.submissionId) {
            throw new TypeError('predicted submission must include participantId and submissionId');
        }
        assertJsonValue(submission.command, 'predicted command');
        const detached = structuredClone(submission);
        this.pendingSubmissions.push(detached);
        this.predicted = structuredClone(this.options.applyPending(structuredClone(this.predicted), structuredClone(detached)));
        return structuredClone(this.predicted);
    }
    reconcile(delta) {
        const origin = delta.origin ?? 'resolution';
        if (this.transitionRevision !== undefined
            && delta.transitionRevision <= this.transitionRevision) {
            return {
                status: 'ignored',
                view: structuredClone(this.predicted ?? this.authoritative),
                transitionRevision: this.transitionRevision,
                viewRevision: this.authoritativeViewRevision,
            };
        }
        if (origin !== 'snapshot'
            && this.transitionRevision !== undefined
            && delta.transitionRevision !== this.transitionRevision + 1) {
            return {
                status: 'resync_required',
                reason: 'transition_gap',
                expectedTransitionRevision: this.transitionRevision + 1,
                receivedTransitionRevision: delta.transitionRevision,
            };
        }
        if (this.authoritative === undefined && delta.body.kind !== 'snapshot') {
            return {
                status: 'resync_required',
                reason: 'missing_base',
                receivedTransitionRevision: delta.transitionRevision,
            };
        }
        let nextAuthoritative;
        try {
            nextAuthoritative = applyObservationDelta(this.authoritative, delta);
        }
        catch {
            return {
                status: 'resync_required',
                reason: 'invalid_delta',
                receivedTransitionRevision: delta.transitionRevision,
            };
        }
        const settledKeys = new Set([
            ...delta.acknowledgements,
            ...delta.rejections,
        ].map(({ participantId, submissionId }) => receiptKey(participantId, submissionId)));
        const settled = [];
        const remaining = this.pendingSubmissions.filter((submission) => {
            const wasSettled = settledKeys.has(receiptKey(submission.participantId, submission.submissionId));
            if (wasSettled)
                settled.push(submission.submissionId);
            return !wasSettled;
        });
        this.pendingSubmissions.splice(0, this.pendingSubmissions.length, ...remaining);
        this.authoritative = structuredClone(nextAuthoritative);
        this.transitionRevision = delta.transitionRevision;
        this.authoritativeViewRevision = delta.viewRevision;
        this.predicted = structuredClone(nextAuthoritative);
        const reapplied = [];
        for (const submission of this.pendingSubmissions) {
            this.predicted = structuredClone(this.options.applyPending(structuredClone(this.predicted), structuredClone(submission)));
            reapplied.push(submission.submissionId);
        }
        return {
            status: 'applied',
            view: structuredClone(this.predicted),
            transitionRevision: delta.transitionRevision,
            viewRevision: delta.viewRevision,
            settled,
            reapplied,
            rolledBack: settled.length > 0 || reapplied.length > 0,
        };
    }
    pending() {
        return deepFreeze(structuredClone(this.pendingSubmissions));
    }
    view() {
        return this.predicted === undefined ? undefined : structuredClone(this.predicted);
    }
}
function canonicalSessionView(view) {
    try {
        return canonicalJson(view);
    }
    catch (error) {
        throw new SessionAdvanceError('invalid_view', `reducer view must be canonically encodable (${error instanceof Error
            ? error.message
            : String(error)})`);
    }
}
function compareUnicodeCodePoints(left, right) {
    const leftPoints = Array.from(left, (value) => value.codePointAt(0));
    const rightPoints = Array.from(right, (value) => value.codePointAt(0));
    const length = Math.min(leftPoints.length, rightPoints.length);
    for (let index = 0; index < length; index++) {
        const difference = leftPoints[index] - rightPoints[index];
        if (difference !== 0)
            return difference;
    }
    return leftPoints.length - rightPoints.length;
}
function checkpointIntegrityDigest(checkpoint) {
    const bytes = sha256(utf8Encoder.encode(canonicalJson(checkpoint)));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function sortedEntries(value) {
    return [...value].sort(([left], [right]) => compareUnicodeCodePoints(left, right));
}
/** Derive the durable session header without initializing reducer state. */
export function sessionHeaderFor(options) {
    return {
        sessionId: options.sessionId,
        game: structuredClone(options.game),
        levelId: options.levelId,
        ...(options.levelVersion === undefined ? {} : { levelVersion: options.levelVersion }),
        level: structuredClone(options.level),
        seed: options.seed,
        seedPolicy: options.seedPolicy,
        seats: [...options.seats],
        cadence: options.cadence.mode === 'turns'
            ? { mode: 'turns' }
            : { mode: 'ticks', ticksPerSecond: options.cadence.rate.ticksPerSecond },
        ...(options.timeoutPolicy === undefined
            ? {}
            : { timeoutPolicy: structuredClone(options.timeoutPolicy) }),
        ...(options.seatKeys === undefined
            ? {}
            : { seatKeys: structuredClone(options.seatKeys) }),
        ...(options.signaturePolicy === undefined
            ? {}
            : { signaturePolicy: structuredClone(options.signaturePolicy) }),
        ...(options.dmath === undefined
            ? {}
            : {
                dmath: {
                    algorithm: options.dmath.algorithm,
                    backend: options.dmath.backend,
                },
            }),
    };
}
class SessionKernelImpl {
    options;
    owner = {};
    isolation;
    limits;
    checkpointCodec;
    historyLookup;
    header;
    tickTimeoutPolicy;
    observationCodec;
    /** O(1) permanent idempotency index, rebuilt from durable accepted events. */
    historicalSubmissionKeys = new Set();
    historicalInterestCommands = new Map();
    draftForks = new WeakMap();
    live;
    compactedRetentionFloor = 0;
    constructor(options, transcript, checkpoint) {
        this.options = options;
        if (!isObjectRecord(options)) {
            throw new TypeError('session kernel options must be an object');
        }
        if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffff_ffff) {
            throw new RangeError('seed must be an unsigned 32-bit integer');
        }
        if (new Set(options.seats).size !== options.seats.length || options.seats.length === 0) {
            throw new TypeError('seats must be non-empty and unique');
        }
        if (options.cadence.mode === 'ticks' && !('advance' in options.reducer)) {
            throw new TypeError('ticks cadence requires TickReducer.advance');
        }
        if (options.hostTime !== 'none' && typeof options.hostTime !== 'function') {
            throw new TypeError("hostTime must be a UTC epoch-millisecond provider or 'none'");
        }
        this.tickTimeoutPolicy = undefined;
        if (options.timeoutPolicy !== undefined) {
            if (!isObjectRecord(options.timeoutPolicy)) {
                throw new TypeError('timeoutPolicy must be an object');
            }
            canonicalJson(options.timeoutPolicy);
            const tickPolicy = isReplayTickTimeoutPolicy(options.timeoutPolicy);
            if (options.seatKeys !== undefined && !tickPolicy) {
                throw new TypeError('signed timeoutPolicy must be { mode: "ticks", windowTicks: positiveInteger }');
            }
            if (tickPolicy) {
                this.tickTimeoutPolicy = structuredClone(options.timeoutPolicy);
                if (options.cadence.mode !== 'ticks') {
                    throw new TypeError('tick-bounded timeoutPolicy requires ticks cadence');
                }
                if (typeof options.timeoutToAction !== 'function') {
                    throw new TypeError('tick-bounded timeoutPolicy requires timeoutToAction');
                }
            }
        }
        if (options.timeoutToAction !== undefined && typeof options.timeoutToAction !== 'function') {
            throw new TypeError('timeoutToAction must be a function');
        }
        if (options.interest !== undefined) {
            if (!isObjectRecord(options.interest)
                || typeof options.interest.narrowView !== 'function') {
                throw new TypeError('interest must supply narrowView');
            }
            const maximum = options.interest.maxScopesPerSeat ?? 8;
            if (!Number.isSafeInteger(maximum) || maximum <= 0) {
                throw new RangeError('interest.maxScopesPerSeat must be a positive safe integer');
            }
            if (options.seatKeys === undefined) {
                throw new TypeError('interest declarations require the RFC-010 signing roster');
            }
        }
        if ((options.seatKeys === undefined) !== (options.signaturePolicy === undefined)) {
            throw new TypeError('seatKeys and signaturePolicy must be supplied together');
        }
        if (options.seatKeys !== undefined) {
            submissionRosterHashV1(options.seatKeys);
            if (options.signaturePolicy?.scheme !== SUBMISSION_SIGNATURE_SCHEME) {
                throw new TypeError(`signaturePolicy.scheme must be ${SUBMISSION_SIGNATURE_SCHEME}`);
            }
            const rosterSeats = new Set(options.seatKeys.map(({ id }) => id));
            if (rosterSeats.size !== options.seats.length
                || options.seats.some((seat) => !rosterSeats.has(seat))) {
                throw new TypeError('seatKeys must name every declared session seat exactly once');
            }
        }
        this.limits = {
            maxFutureTicks: options.limits?.maxFutureTicks
                ?? (options.cadence.mode === 'ticks'
                    ? options.cadence.rate.ticksPerSecond * 2
                    : 1),
            maxCatchUpTicks: options.limits?.maxCatchUpTicks ?? DEFAULT_LIMITS.maxCatchUpTicks,
            receiptRetention: options.limits?.receiptRetention ?? DEFAULT_LIMITS.receiptRetention,
            maxExtensionBytes: options.limits?.maxExtensionBytes ?? DEFAULT_LIMITS.maxExtensionBytes,
            checkpointInterval: options.limits?.checkpointInterval ?? DEFAULT_LIMITS.checkpointInterval,
            maxOpenCommitmentsPerSeat: options.limits?.maxOpenCommitmentsPerSeat
                ?? DEFAULT_LIMITS.maxOpenCommitmentsPerSeat,
        };
        for (const [key, value] of Object.entries(this.limits)) {
            if (!Number.isSafeInteger(value) || value < (key === 'receiptRetention' ? 0 : 1)) {
                throw new RangeError(`${key} has an invalid bound`);
            }
        }
        const observationCodec = options.observationCodec ?? { version: 'v2' };
        if (!isObjectRecord(observationCodec) || observationCodec.version !== 'v2') {
            throw new TypeError('observationCodec must be a v2 options object');
        }
        const patchStrategy = observationCodec.patchStrategy ?? 'adaptive';
        const patchBackoffTicks = observationCodec.patchBackoffTicks ?? 8;
        const maxPatchBackoffTicks = observationCodec.maxPatchBackoffTicks
            ?? Math.max(32, patchBackoffTicks);
        const maxOperations = observationCodec.maxOperations ?? 2_048;
        const maxBytes = observationCodec.maxBytes ?? 65_536;
        const minReduction = observationCodec.minReduction ?? 4;
        if (patchStrategy !== 'adaptive' && patchStrategy !== 'never') {
            throw new TypeError("patchStrategy must be 'adaptive' or 'never'");
        }
        if (!Number.isSafeInteger(patchBackoffTicks) || patchBackoffTicks < 0) {
            throw new RangeError('patchBackoffTicks must be a non-negative safe integer');
        }
        if (!Number.isSafeInteger(maxPatchBackoffTicks)
            || maxPatchBackoffTicks < patchBackoffTicks) {
            throw new RangeError('maxPatchBackoffTicks must be a safe integer >= patchBackoffTicks');
        }
        if (!Number.isSafeInteger(maxOperations) || maxOperations <= 0
            || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
            throw new RangeError('v2 observation codec bounds must be positive safe integers');
        }
        if (!Number.isFinite(minReduction) || minReduction < 1) {
            throw new RangeError('minReduction must be a finite number >= 1');
        }
        this.observationCodec = {
            version: 'v2',
            patchStrategy,
            patchBackoffTicks,
            maxPatchBackoffTicks,
            maxOperations,
            maxBytes,
            minReduction,
        };
        this.isolation = options.stateIsolation ?? {
            fork: (state) => structuredClone(state),
        };
        this.checkpointCodec = options.checkpointCodec ?? {
            id: 'gaos.json',
            version: '1',
            encode: (state) => {
                const encoded = structuredClone(state);
                assertJsonValue(encoded, 'checkpoint reducerState');
                return encoded;
            },
            decode: (value) => structuredClone(value),
        };
        if (typeof this.checkpointCodec.id !== 'string' || !this.checkpointCodec.id
            || typeof this.checkpointCodec.version !== 'string' || !this.checkpointCodec.version
            || typeof this.checkpointCodec.encode !== 'function'
            || typeof this.checkpointCodec.decode !== 'function') {
            throw new TypeError('checkpointCodec must provide id, version, encode, and decode');
        }
        this.historyLookup = options.historyLookup;
        if (this.historyLookup !== undefined
            && (typeof this.historyLookup.gameplaySubmission !== 'function'
                || typeof this.historyLookup.interestCommand !== 'function'
                || typeof this.historyLookup.saltIdentity !== 'function')) {
            throw new TypeError('historyLookup must provide gameplay, interest, and salt lookups');
        }
        const levelSeed = options.seedPolicy === 'gaos.run-level-seed.v1'
            ? runLevelSeed(options.seed, 0)
            : options.seed;
        const initialState = options.reducer.init(options.level, levelSeed);
        try {
            const probe = this.isolation.fork(initialState);
            this.isolation.discard?.(probe);
        }
        catch (error) {
            throw new TypeError('reducer state is not cloneable; provide SessionStateIsolation.fork'
                + ` (${error instanceof Error ? error.message : String(error)})`);
        }
        this.header = sessionHeaderFor(options);
        const initialView = options.reducer.view(initialState);
        try {
            replayMetricsFor(options.reducer, initialState, initialView);
        }
        catch (error) {
            throw new TypeError(`reducer replay metrics are invalid (${error instanceof Error
                ? error.message
                : String(error)})`);
        }
        const participants = this.validatedParticipantsForView(initialView);
        const views = new Map();
        const viewCanonical = new Map();
        const revisions = new Map();
        const interestScopes = new Map();
        for (const seat of options.seats) {
            const seatView = this.viewFor(initialState, seat);
            views.set(seat, seatView);
            let canonical;
            try {
                canonical = canonicalSessionView(seatView);
                viewCanonical.set(seat, canonical);
            }
            catch (error) {
                throw new TypeError(error instanceof Error ? error.message : 'reducer view must be canonically encodable');
            }
            revisions.set(seat, 0);
            interestScopes.set(interestScopeKey(seat, seat), {
                participantId: seat,
                scopeId: seat,
                declared: false,
                declaration: null,
                view: seatView,
                canonical,
                patchBackoffRemaining: 0,
                patchBackoffWindow: patchBackoffTicks,
            });
        }
        this.live = {
            reducerState: initialState,
            window: createIntentWindow(options.sessionId, 0, participants),
            transitionRevision: 0,
            cursor: 0,
            tick: 0,
            lastCheckpointTick: 0,
            events: [],
            rejectionHistory: [],
            receipts: new Map(),
            expiredReceiptKeys: new Set(),
            views,
            viewCanonical,
            viewRevisions: revisions,
            commitments: new Map(),
            nextCommitmentIds: new Map(),
            seenSalts: new Map(),
            interestScopes,
        };
        if (checkpoint !== undefined)
            this.restoreCheckpoint(checkpoint);
        if (transcript !== undefined)
            this.rehydrate(transcript);
    }
    viewFor(state, seat) {
        if (!this.options.seats.includes(seat))
            throw new RangeError(`unknown seat ${seat}`);
        return this.options.reducer.viewFor
            ? this.options.reducer.viewFor(state, seat)
            : this.options.reducer.view(state);
    }
    replayMetrics(state, view) {
        try {
            return replayMetricsFor(this.options.reducer, state, view);
        }
        catch (error) {
            throw new SessionAdvanceError('invalid_view', `reducer replay metrics are invalid (${error instanceof Error
                ? error.message
                : String(error)})`);
        }
    }
    encodedObservation(previous, next, nextCanonical, unchanged, patchBackoffRemaining, patchBackoffWindow) {
        if (unchanged) {
            return {
                codec: 'v2',
                body: { kind: 'unchanged' },
                patchBackoffRemaining,
                patchBackoffWindow,
            };
        }
        if (this.observationCodec.patchStrategy === 'never') {
            return {
                codec: 'v2',
                body: { kind: 'snapshot', view: structuredClone(next) },
                patchBackoffRemaining: 0,
                patchBackoffWindow: this.observationCodec.patchBackoffTicks,
            };
        }
        if (patchBackoffRemaining > 0) {
            return {
                codec: 'v2',
                body: { kind: 'snapshot', view: structuredClone(next) },
                patchBackoffRemaining: patchBackoffRemaining - 1,
                patchBackoffWindow,
            };
        }
        const snapshotBytes = utf8Encoder.encode(nextCanonical).length;
        const maximumPatchBytes = Math.min(this.observationCodec.maxBytes, Math.floor(snapshotBytes / this.observationCodec.minReduction));
        try {
            const patch = maximumPatchBytes < 2
                ? null
                : createBoundedValidatedJsonPatch(previous, next, this.observationCodec.maxOperations, maximumPatchBytes);
            if (patch !== null) {
                return {
                    codec: 'v2',
                    body: { kind: 'patch', operations: patch.operations },
                    patchBackoffRemaining: 0,
                    patchBackoffWindow: this.observationCodec.patchBackoffTicks,
                };
            }
        }
        catch {
            // Unsafe pointer keys use the mandatory snapshot fallback.
        }
        return {
            codec: 'v2',
            body: { kind: 'snapshot', view: structuredClone(next) },
            patchBackoffRemaining: patchBackoffWindow,
            patchBackoffWindow: Math.min(this.observationCodec.maxPatchBackoffTicks, Math.max(this.observationCodec.patchBackoffTicks, patchBackoffWindow * 2)),
        };
    }
    scopedView(fullView, scope, cursor, tick) {
        const interest = this.options.interest;
        const usesFullView = ('declared' in scope && !scope.declared)
            || interest === undefined;
        const view = usesFullView
            ? fullView
            : interest.narrowView(structuredClone(fullView), {
                sessionId: this.options.sessionId,
                participantId: scope.participantId,
                scopeId: scope.scopeId,
                cursor,
                tick,
                declaration: structuredClone(scope.declaration),
            });
        const canonical = canonicalSessionView(view);
        if (!isJsonProjection(fullView, view)) {
            throw new SessionAdvanceError('invalid_view', `interest scope ${scope.scopeId} widened or altered the partitioned view`);
        }
        // A product hook may retain the object it returns. Detach declared scopes
        // from that reference; default scopes can safely share the internal view.
        return { view: usesFullView ? view : structuredClone(view), canonical };
    }
    validatedParticipantsForView(view) {
        if (view.status === 'ended' && view.stars !== undefined) {
            throw new SessionAdvanceError('invalid_view', 'an ended session view must not report stars');
        }
        const participants = participantsForView(view, this.options.seats);
        if (participants.length === 0
            || participants.some((seat) => !this.options.seats.includes(seat))) {
            const declared = [...this.options.seats].sort(compareUnicodeCodePoints);
            const supplied = [...participants].sort(compareUnicodeCodePoints);
            const reason = supplied.length === 0
                ? 'supplied set is empty'
                : `undeclared seats: ${supplied
                    .filter((seat) => !this.options.seats.includes(seat))
                    .join(', ')}`;
            throw new TypeError(`reducer participation must name one or more declared session seats; `
                + `declared=[${declared.join(', ')}], supplied=[${supplied.join(', ')}] (${reason})`);
        }
        return participants;
    }
    forkLive() {
        const reducerState = this.isolation.fork(this.live.reducerState);
        const draft = {
            reducerState,
            window: structuredClone(this.live.window),
            transitionRevision: this.live.transitionRevision,
            cursor: this.live.cursor,
            tick: this.live.tick,
            lastCheckpointTick: this.live.lastCheckpointTick,
            events: [...this.live.events],
            rejectionHistory: structuredClone(this.live.rejectionHistory),
            receipts: cloneMapValues(this.live.receipts),
            expiredReceiptKeys: new Set(this.live.expiredReceiptKeys),
            // Derived views are immutable and replaced, never mutated in place.
            views: new Map(this.live.views),
            viewCanonical: new Map(this.live.viewCanonical),
            viewRevisions: new Map(this.live.viewRevisions),
            commitments: cloneMapValues(this.live.commitments),
            nextCommitmentIds: new Map(this.live.nextCommitmentIds),
            seenSalts: new Map(this.live.seenSalts),
            interestScopes: forkInterestScopes(this.live.interestScopes),
        };
        this.draftForks.set(draft, reducerState);
        return draft;
    }
    takeDraftResources(draft) {
        const original = this.draftForks.get(draft);
        this.draftForks.delete(draft);
        if (original === undefined || original === draft.reducerState) {
            return [draft.reducerState];
        }
        return [original, draft.reducerState];
    }
    discardDraft(draft) {
        for (const resource of this.takeDraftResources(draft)) {
            this.isolation.discard?.(resource);
        }
    }
    makePrepared(draft, rawEvents, deltas, result, noop = false) {
        const base = this.live.transitionRevision;
        const nextRevision = noop ? base : base + 1;
        const events = rawEvents.map((raw, index) => {
            let hostTime;
            if (this.options.hostTime !== 'none') {
                const providedHostTime = this.options.hostTime();
                if (!Number.isSafeInteger(providedHostTime) || providedHostTime < 0) {
                    throw new RangeError('hostTime must be non-negative UTC epoch milliseconds');
                }
                hostTime = providedHostTime;
            }
            return {
                ...structuredClone(raw),
                eventId: eventId(this.options.sessionId, nextRevision, index),
                transitionRevision: nextRevision,
                ...(hostTime === undefined ? {} : { hostTime }),
            };
        });
        if (!noop) {
            draft.transitionRevision = nextRevision;
            draft.events.push(...events);
            draft.rejectionHistory.push(...events.flatMap((event) => (event.kind === 'rejection'
                ? [{
                        transitionRevision: event.transitionRevision,
                        tick: event.tick,
                        participantId: event.participantId,
                        submissionId: event.submissionId,
                        code: event.code,
                    }]
                : [])));
        }
        // The two delta array shells intentionally remain distinct, while one
        // structured clone memoizes their shared (and usually much larger)
        // element graph. This preserves the prepared-result isolation contract
        // without serializing every snapshot twice.
        const published = deepFreeze(structuredClone({
            events,
            deltas: [...deltas],
            result,
        }));
        const state = {
            owner: this.owner,
            completion: 'open',
            next: draft,
            drafts: this.takeDraftResources(draft),
            noop,
        };
        return Object.freeze({
            baseTransitionRevision: base,
            nextTransitionRevision: nextRevision,
            events: published.events,
            deltas: published.deltas,
            result: published.result,
            [preparedTransition]: state,
        });
    }
    preparedState(prepared, allowAborted = false) {
        const value = prepared?.[preparedTransition];
        if (!value || value.owner !== this.owner) {
            throw new PreparedTransitionError('foreign', 'prepared transition belongs to another kernel');
        }
        if (value.completion !== 'open' && !(allowAborted && value.completion === 'aborted')) {
            throw new PreparedTransitionError('already_completed', `prepared transition was already ${value.completion}`);
        }
        return value;
    }
    prepareIngest(submission) {
        if (submission === null || typeof submission !== 'object' || Array.isArray(submission)) {
            throw new IntentCollectionError('invalid_submission', 'submission must be an object');
        }
        if (submission.protocol !== PROTOCOL_ID || submission.protocolVersion !== PROTOCOL_VERSION) {
            throw new IntentCollectionError('invalid_protocol', `expected ${PROTOCOL_ID} ${PROTOCOL_VERSION}`);
        }
        if (submission.sessionId !== this.options.sessionId) {
            throw new IntentCollectionError('wrong_session', 'submission session does not match endpoint');
        }
        const key = receiptKey(submission.participantId, submission.submissionId);
        let canonicalCommand;
        try {
            canonicalCommand = canonicalJson(submission.command);
        }
        catch (error) {
            throw new IntentCollectionError('invalid_submission', error instanceof Error ? error.message : 'submission command must contain plain JSON');
        }
        if (this.header.signaturePolicy !== undefined) {
            const hasClientTime = submission.clientTime !== undefined;
            const hasPrevious = submission.prevChainHash !== undefined;
            if (hasClientTime !== hasPrevious || (submission.sig !== undefined && !hasClientTime)) {
                throw new IntentCollectionError('invalid_submission', 'signed sessions require both clientTime and prevChainHash, with sig optional');
            }
            if (hasClientTime) {
                if (!Number.isSafeInteger(submission.clientTime) || submission.clientTime < 0) {
                    throw new IntentCollectionError('invalid_submission', 'clientTime must be a non-negative safe integer');
                }
                try {
                    signatureBytesFromBase64(submission.prevChainHash, 'prevChainHash', 32);
                    if (submission.sig !== undefined) {
                        signatureBytesFromBase64(submission.sig, 'sig', 64);
                    }
                }
                catch (error) {
                    throw new IntentCollectionError('invalid_submission', error instanceof Error ? error.message : String(error));
                }
            }
        }
        const existing = this.live.receipts.get(key);
        if (existing) {
            if (existing.canonicalCommand !== canonicalCommand
                || existing.tickId !== submission.tickId
                || existing.cursor !== submission.revision) {
                throw new SessionConflictError('submission id was reused with different content or cursor');
            }
            const draft = this.forkLive();
            try {
                return this.makePrepared(draft, [], [], {
                    ...existing.receipt,
                    status: 'duplicate',
                    resolved: existing.cursor < this.live.cursor,
                }, true);
            }
            catch (error) {
                this.discardDraft(draft);
                throw error;
            }
        }
        validateIntentSubmission(this.live.window, submission);
        if (this.options.reducer.view(this.live.reducerState).status !== 'playing') {
            throw new SessionAdvanceError('terminal', 'session is already terminal');
        }
        if (this.live.expiredReceiptKeys.has(key)
            || this.historicalSubmissionKeys.has(key)
            || this.historicalInterestCommands.has(key)
            || this.historyLookup?.gameplaySubmission(submission.participantId, submission.submissionId)
            || this.historyLookup?.interestCommand(submission.participantId, submission.submissionId) !== undefined) {
            throw new SessionConflictError('unknown_submission', 'receipt retention has expired');
        }
        const preview = actionCopy(this.options.commandToAction(submission.command, {
            sessionId: this.options.sessionId,
            participantId: submission.participantId,
            submissionId: submission.submissionId,
            cursor: this.live.cursor,
            tick: this.live.tick,
        }));
        if (preview.seat !== undefined && preview.seat !== submission.participantId) {
            throw new SessionConflictError('a participant command cannot impersonate another seat');
        }
        if (preview.verifiedPayload !== undefined) {
            throw new SessionConflictError('verifiedPayload is reserved for the session verifier');
        }
        if (preview.commit && preview.reveal) {
            throw new SessionConflictError('commit and reveal are mutually exclusive');
        }
        if (preview.commit) {
            try {
                assertCommitmentEnvelope(preview.commit);
            }
            catch (error) {
                throw new SessionConflictError(`invalid commitment envelope: `
                    + `${error instanceof Error ? error.message : String(error)}`);
            }
            const expected = this.live.nextCommitmentIds.get(submission.participantId) ?? 0;
            if (preview.commit.commitmentId !== expected) {
                throw new SessionConflictError(`commitmentId ${preview.commit.commitmentId} must be ${expected}`);
            }
            const open = [...this.live.commitments.values()].filter((commitment) => commitment.seat === submission.participantId
                && !commitment.revealed).length;
            if (open >= this.limits.maxOpenCommitmentsPerSeat) {
                throw new SessionConflictError(`seat ${submission.participantId} reached maxOpenCommitmentsPerSeat`);
            }
        }
        if (preview.reveal) {
            const commitment = this.live.commitments.get(commitmentKey(submission.participantId, preview.reveal.commitmentId));
            if (!commitment || commitment.revealed) {
                throw new SessionConflictError('reveal references an unknown or revealed commitment');
            }
            try {
                createCommitmentHash({
                    sessionId: this.options.sessionId,
                    seat: submission.participantId,
                    commitmentId: commitment.envelope.commitmentId,
                    windowRef: commitment.windowRef,
                }, preview.reveal.salt, preview.reveal.payload);
            }
            catch (error) {
                throw new SessionConflictError(`invalid reveal envelope: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (this.options.reducer.validateCommand) {
            const validationState = this.isolation.fork(this.live.reducerState);
            try {
                this.options.reducer.validateCommand(validationState, submission.participantId, structuredClone(preview));
            }
            catch (error) {
                throw new IntentCollectionError('illegal_command', `command rejected by reducer (${error instanceof Error
                    ? error.message
                    : String(error)})`, error);
            }
            finally {
                this.isolation.discard?.(validationState);
            }
        }
        const collected = collectIntent(this.live.window, submission);
        const draft = this.forkLive();
        draft.window = structuredClone(collected.window);
        const submittedParticipants = draft.window.participants.filter((seat) => Object.hasOwn(draft.window.intents, seat));
        const awaitingParticipants = draft.window.participants.filter((seat) => !Object.hasOwn(draft.window.intents, seat));
        const receipt = {
            status: 'accepted',
            participantId: submission.participantId,
            submissionId: submission.submissionId,
            cursor: draft.cursor,
            tick: draft.tick,
            submittedParticipants,
            awaitingParticipants,
            resolved: false,
        };
        draft.receipts.set(key, {
            canonicalCommand,
            tickId: submission.tickId,
            receipt,
            cursor: draft.cursor,
        });
        try {
            return this.makePrepared(draft, [{
                    kind: 'intent-accepted',
                    tick: draft.tick,
                    revision: draft.cursor,
                    participantId: submission.participantId,
                    submissionId: submission.submissionId,
                    command: structuredClone(submission.command),
                    canonicalCommand,
                    ...(submission.clientTime === undefined ? {} : { clientTime: submission.clientTime }),
                    ...(submission.prevChainHash === undefined
                        ? {}
                        : { prevChainHash: submission.prevChainHash }),
                    ...(submission.sig === undefined ? {} : { sig: submission.sig }),
                }], [], receipt);
        }
        catch (error) {
            this.discardDraft(draft);
            throw error;
        }
    }
    mapIntents(draft, intents) {
        const inputs = [];
        const warnings = [];
        const commitments = cloneMapValues(draft.commitments);
        const nextCommitmentIds = new Map(draft.nextCommitmentIds);
        const seenSalts = new Map(draft.seenSalts);
        for (const intent of intents) {
            const context = {
                sessionId: this.options.sessionId,
                participantId: intent.participantId,
                submissionId: intent.submissionId,
                cursor: draft.cursor,
                tick: draft.tick,
            };
            const action = actionCopy(this.options.commandToAction(intent.command, context));
            if (action.seat !== undefined && action.seat !== intent.participantId) {
                throw new SessionConflictError('a participant command cannot impersonate another seat');
            }
            action.seat ??= intent.participantId;
            if (action.verifiedPayload !== undefined) {
                throw new SessionConflictError('verifiedPayload is reserved for the session verifier');
            }
            if (action.commit && action.reveal) {
                throw new SessionConflictError('commit and reveal are mutually exclusive');
            }
            if (action.commit) {
                assertCommitmentEnvelope(action.commit);
                const expected = nextCommitmentIds.get(intent.participantId) ?? 0;
                if (action.commit.commitmentId !== expected) {
                    throw new SessionConflictError(`commitmentId ${action.commit.commitmentId} must be ${expected}`);
                }
                commitments.set(commitmentKey(intent.participantId, expected), {
                    envelope: structuredClone(action.commit),
                    seat: intent.participantId,
                    windowRef: draft.tick,
                    revealed: false,
                });
                nextCommitmentIds.set(intent.participantId, expected + 1);
            }
            if (action.reveal) {
                const identity = commitmentKey(intent.participantId, action.reveal.commitmentId);
                const priorIdentity = seenSalts.get(action.reveal.salt)
                    ?? this.historyLookup?.saltIdentity(action.reveal.salt);
                if (priorIdentity !== undefined && priorIdentity !== identity) {
                    warnings.push({
                        code: 'salt_reuse',
                        message: 'commitment salt was reused within this session',
                        participantId: intent.participantId,
                        commitmentId: action.reveal.commitmentId,
                    });
                }
                else {
                    seenSalts.set(action.reveal.salt, identity);
                }
                const key = commitmentKey(intent.participantId, action.reveal.commitmentId);
                const commitment = commitments.get(key);
                if (!commitment || commitment.revealed) {
                    throw new SessionConflictError('reveal references an unknown or revealed commitment');
                }
                const actual = createCommitmentHash({
                    sessionId: this.options.sessionId,
                    seat: intent.participantId,
                    commitmentId: commitment.envelope.commitmentId,
                    windowRef: commitment.windowRef,
                }, action.reveal.salt, action.reveal.payload);
                if (actual !== commitment.envelope.hash) {
                    draft.seenSalts = seenSalts;
                    return {
                        inputs,
                        warnings,
                        rejection: {
                            kind: 'rejection',
                            code: 'commit_mismatch',
                            tick: draft.tick,
                            participantId: intent.participantId,
                            submissionId: intent.submissionId,
                            commitmentId: action.reveal.commitmentId,
                            scheme: COMMITMENT_SCHEME,
                            attemptedReveal: {
                                salt: action.reveal.salt,
                                payload: structuredClone(action.reveal.payload),
                            },
                            canonicalCommand: canonicalJson(intent.command),
                            cursor: draft.cursor,
                            ...(intent.clientTime === undefined ? {} : { clientTime: intent.clientTime }),
                            ...(intent.prevChainHash === undefined
                                ? {}
                                : { prevChainHash: intent.prevChainHash }),
                            ...(intent.sig === undefined ? {} : { sig: intent.sig }),
                        },
                    };
                }
                commitment.revealed = true;
                action.verifiedPayload = structuredClone(action.reveal.payload);
            }
            inputs.push({
                participantId: intent.participantId,
                submissionId: intent.submissionId,
                canonicalCommand: canonicalJson(intent.command),
                cursor: draft.cursor,
                action,
                ...(intent.clientTime === undefined ? {} : { clientTime: intent.clientTime }),
                ...(intent.prevChainHash === undefined
                    ? {}
                    : { prevChainHash: intent.prevChainHash }),
                ...(intent.sig === undefined ? {} : { sig: intent.sig }),
            });
        }
        draft.commitments = commitments;
        draft.nextCommitmentIds = nextCommitmentIds;
        draft.seenSalts = seenSalts;
        return { inputs, warnings };
    }
    resolveOnce(draft, cause, forcedInputs) {
        const intents = draft.window.participants
            .filter((seat) => Object.hasOwn(draft.window.intents, seat))
            .map((seat) => draft.window.intents[seat]);
        if (cause === 'complete' && intents.length !== draft.window.participants.length) {
            throw new SessionAdvanceError('not_ready', 'the current intent window is not complete');
        }
        const collectedInputs = this.mapIntents(draft, intents);
        const mapped = forcedInputs && !collectedInputs.rejection
            ? {
                inputs: [...collectedInputs.inputs, ...forcedInputs],
                warnings: collectedInputs.warnings,
            }
            : collectedInputs;
        if ('rejection' in mapped && mapped.rejection) {
            const rejectedSeat = mapped.rejection.participantId;
            const nextIntents = { ...draft.window.intents };
            delete nextIntents[rejectedSeat];
            draft.window = { ...draft.window, intents: nextIntents };
            draft.receipts.delete(receiptKey(mapped.rejection.participantId, mapped.rejection.submissionId));
            return { rejection: mapped.rejection, deltas: [], warnings: mapped.warnings };
        }
        draft.reducerState = advanceTick(this.options.reducer, draft.reducerState, mapped.inputs.map((entry) => entry.action));
        const resolvedTick = draft.tick;
        const resolvedCursor = draft.cursor;
        const acknowledgements = mapped.inputs.flatMap(({ participantId, submissionId }) => (participantId === null || submissionId === null
            ? []
            : [{ participantId, submissionId }]));
        draft.cursor++;
        draft.tick++;
        const view = this.options.reducer.view(draft.reducerState);
        const replayMetrics = this.replayMetrics(draft.reducerState, view);
        const deltas = [];
        for (const seat of this.options.seats) {
            const next = this.viewFor(draft.reducerState, seat);
            const revision = (draft.viewRevisions.get(seat) ?? 0) + 1;
            const canonicalNext = canonicalSessionView(next);
            const nextSnapshot = structuredClone(next);
            draft.views.set(seat, nextSnapshot);
            draft.viewCanonical.set(seat, canonicalNext);
            draft.viewRevisions.set(seat, revision);
            const scopes = [...draft.interestScopes.values()].filter((scope) => scope.participantId === seat);
            for (const scope of scopes) {
                const scoped = this.scopedView(nextSnapshot, scope, draft.cursor, draft.tick);
                const unchanged = scope.canonical === scoped.canonical;
                const encoded = this.encodedObservation(scope.view, scoped.view, scoped.canonical, unchanged, scope.patchBackoffRemaining, scope.patchBackoffWindow);
                deltas.push({
                    seat,
                    scopeId: scope.scopeId,
                    ...(scope.declared
                        ? { interest: { declaration: structuredClone(scope.declaration) } }
                        : {}),
                    transitionRevision: draft.transitionRevision + 1,
                    viewRevision: revision,
                    tick: draft.tick,
                    codec: encoded.codec,
                    origin: 'resolution',
                    acknowledgements: structuredClone(acknowledgements),
                    rejections: [],
                    body: encoded.body,
                    viewDigest: fnv1a(scoped.canonical),
                });
                scope.view = scoped.view;
                scope.canonical = scoped.canonical;
                scope.patchBackoffRemaining = encoded.patchBackoffRemaining;
                scope.patchBackoffWindow = encoded.patchBackoffWindow;
            }
        }
        draft.window = createIntentWindow(this.options.sessionId, draft.cursor, this.validatedParticipantsForView(view));
        this.evictReceipts(draft);
        return {
            event: {
                kind: 'resolution',
                tick: resolvedTick,
                cursor: resolvedCursor,
                cause,
                consumed: intents.map(({ participantId, submissionId }) => ({
                    participantId,
                    submissionId,
                })),
                inputs: mapped.inputs.map((entry) => structuredClone(entry)),
                ...(forcedInputs?.[0] === undefined
                    ? {}
                    : { systemInput: structuredClone(forcedInputs[0]) }),
                result: {
                    status: view.status,
                    stars: view.stars ?? null,
                    actionsUsed: replayMetrics.actionsUsed,
                },
            },
            deltas,
            warnings: mapped.warnings,
        };
    }
    evictReceipts(draft) {
        const oldest = draft.cursor - this.limits.receiptRetention;
        for (const [key, receipt] of draft.receipts) {
            if (receipt.cursor < oldest) {
                draft.receipts.delete(key);
                draft.expiredReceiptKeys.add(key);
            }
        }
        const maximumTombstones = Math.max(this.options.seats.length, this.options.seats.length * Math.max(1, this.limits.receiptRetention));
        while (draft.expiredReceiptKeys.size > maximumTombstones) {
            const first = draft.expiredReceiptKeys.values().next().value;
            if (first === undefined)
                break;
            draft.expiredReceiptKeys.delete(first);
        }
    }
    rejectionDeltas(draft, rejection) {
        const transitionRevision = draft.transitionRevision + 1;
        return [...draft.interestScopes.values()].map((scope) => {
            const seat = scope.participantId;
            return {
                seat,
                scopeId: scope.scopeId,
                ...(scope.declared
                    ? { interest: { declaration: structuredClone(scope.declaration) } }
                    : {}),
                transitionRevision,
                viewRevision: draft.viewRevisions.get(seat),
                tick: draft.tick,
                codec: 'v2',
                origin: 'resolution',
                acknowledgements: [],
                rejections: [{
                        seat,
                        transitionRevision,
                        tick: rejection.tick,
                        participantId: rejection.participantId,
                        submissionId: rejection.submissionId,
                        code: rejection.code,
                    }],
                body: { kind: 'unchanged' },
                viewDigest: fnv1a(scope.canonical),
            };
        });
    }
    rejectionNoticesSince(seat, afterTransitionRevision) {
        if (!this.options.seats.includes(seat))
            throw new RangeError(`unknown seat ${seat}`);
        return this.live.rejectionHistory.flatMap((rejection) => (rejection.transitionRevision > afterTransitionRevision
            ? [{
                    seat,
                    ...structuredClone(rejection),
                }]
            : []));
    }
    prepareAdvance(target) {
        const draft = this.forkLive();
        const rawEvents = [];
        const deltas = [];
        const rejections = [];
        const warnings = [];
        try {
            const currentView = this.options.reducer.view(draft.reducerState);
            if (currentView.status !== 'playing') {
                throw new SessionAdvanceError('terminal', 'session is already terminal');
            }
            let requested = 1;
            let partial = false;
            if (this.options.cadence.mode === 'turns') {
                if (target !== undefined) {
                    throw new SessionAdvanceError('invalid_target', 'target is forbidden in turns mode');
                }
            }
            else {
                if (target === undefined)
                    target = draft.tick;
                if (!Number.isSafeInteger(target) || target < 0) {
                    throw new SessionAdvanceError('invalid_target', 'target must be a non-negative safe integer');
                }
                if (target < draft.tick) {
                    throw new SessionAdvanceError('stale_target', 'target precedes the current tick');
                }
                const ready = draft.window.participants.every((seat) => Object.hasOwn(draft.window.intents, seat));
                if (this.tickTimeoutPolicy !== undefined && !ready) {
                    const deadline = draft.tick + this.tickTimeoutPolicy.windowTicks;
                    if (target >= deadline) {
                        throw new SessionAdvanceError('not_ready', `open window reached tick ${deadline}; prepareTimeout is required`);
                    }
                    requested = 0;
                }
                if (target - draft.tick > this.limits.maxFutureTicks) {
                    throw new SessionAdvanceError('invalid_target', 'target exceeds maxFutureTicks');
                }
                if (requested !== 0) {
                    requested = target - draft.tick + 1;
                    if (requested > this.limits.maxCatchUpTicks) {
                        requested = this.limits.maxCatchUpTicks;
                        partial = true;
                    }
                }
            }
            let resolutions = 0;
            for (let index = 0; index < requested; index++) {
                const ready = draft.window.participants.every((seat) => Object.hasOwn(draft.window.intents, seat));
                const cause = this.options.cadence.mode === 'turns'
                    ? 'complete'
                    : ready ? 'complete' : 'tick';
                const resolved = this.resolveOnce(draft, cause);
                warnings.push(...resolved.warnings);
                if (resolved.rejection) {
                    rawEvents.push(resolved.rejection);
                    rejections.push(...this.options.seats.map((seat) => ({
                        seat,
                        transitionRevision: this.live.transitionRevision + 1,
                        tick: resolved.rejection.tick,
                        participantId: resolved.rejection.participantId,
                        submissionId: resolved.rejection.submissionId,
                        code: resolved.rejection.code,
                    })));
                    deltas.push(...this.rejectionDeltas(draft, resolved.rejection));
                    break;
                }
                if (resolved.event) {
                    rawEvents.push(resolved.event);
                    deltas.push(...resolved.deltas);
                    resolutions++;
                }
                if (this.options.reducer.view(draft.reducerState).status !== 'playing')
                    break;
                if (this.tickTimeoutPolicy !== undefined
                    && !draft.window.participants.every((seat) => Object.hasOwn(draft.window.intents, seat))) {
                    partial ||= index + 1 < requested;
                    break;
                }
            }
            const digest = this.digestState(draft);
            const checkpointDue = resolutions > 0
                && draft.tick - draft.lastCheckpointTick >= this.limits.checkpointInterval;
            if (checkpointDue || rawEvents.at(-1)?.kind === 'rejection') {
                rawEvents.push({ kind: 'checkpoint', tick: draft.tick, digest });
                draft.lastCheckpointTick = draft.tick;
            }
            const result = {
                resolutions,
                partial,
                cursor: draft.cursor,
                tick: draft.tick,
                digest,
                deltas,
                rejections,
                warnings,
            };
            return this.makePrepared(draft, rawEvents, deltas, result, requested === 0);
        }
        catch (error) {
            this.discardDraft(draft);
            throw error;
        }
    }
    prepareTimeout(timeout, forcedInput) {
        if (!isObjectRecord(timeout)) {
            throw new TypeError('timeout must be an object');
        }
        if (typeof timeout.timeoutId !== 'string' || timeout.timeoutId.length === 0) {
            throw new TypeError('timeoutId must be a non-empty string');
        }
        if (typeof timeout.reason !== 'string' || timeout.reason.length === 0) {
            throw new TypeError('timeout reason must be a non-empty string');
        }
        if (timeout.timeoutPolicyRef !== undefined
            && (typeof timeout.timeoutPolicyRef !== 'string'
                || timeout.timeoutPolicyRef.length === 0)) {
            throw new TypeError('timeoutPolicyRef must be a non-empty string');
        }
        const policy = this.tickTimeoutPolicy;
        if (policy === undefined) {
            if (!Number.isSafeInteger(timeout.tick) || timeout.tick !== this.live.tick) {
                throw new SessionAdvanceError('stale_target', 'timeout tick must equal the open tick');
            }
        }
        else {
            if (timeout.timeoutPolicyRef !== GAOS_TIMEOUT_POLICY_REF) {
                throw new SessionConflictError(`timeoutPolicyRef must be ${GAOS_TIMEOUT_POLICY_REF}`);
            }
            if (!Number.isSafeInteger(timeout.tick)
                || timeout.tick !== this.live.cursor + policy.windowTicks) {
                throw new SessionAdvanceError('stale_target', 'timeout tick must equal windowRef + timeoutPolicy.windowTicks');
            }
        }
        const participantId = timeout.participantId ?? null;
        if (participantId !== null) {
            if (!this.live.window.participants.includes(participantId)) {
                throw new SessionConflictError('timeout participant is not eligible in the open window');
            }
            if (Object.hasOwn(this.live.window.intents, participantId)) {
                throw new SessionConflictError('timeout participant already submitted in the open window');
            }
        }
        let derivedInput;
        if (this.options.timeoutToAction === undefined) {
            if (this.header.signaturePolicy !== undefined) {
                throw new SessionConflictError('signed sessions require timeoutToAction for timeout transitions');
            }
            if (!isObjectRecord(forcedInput)) {
                throw new TypeError('forcedInput must be an object');
            }
            derivedInput = forcedInput;
        }
        else {
            derivedInput = this.options.timeoutToAction({
                sessionId: this.header.sessionId,
                game: structuredClone(this.header.game),
                levelId: this.header.levelId,
                ...(this.header.levelVersion === undefined
                    ? {}
                    : { levelVersion: this.header.levelVersion }),
                level: structuredClone(this.header.level),
                seed: this.header.seedPolicy === GAOS_REPLAY_DERIVED_SEEDS
                    ? runLevelSeed(this.header.seed, 0)
                    : this.header.seed,
                participantId,
                windowRef: this.live.cursor,
            }, structuredClone(timeout));
            if (!isObjectRecord(derivedInput)) {
                throw new TypeError('timeoutToAction must return a SubmittedAction object');
            }
            if (forcedInput !== undefined
                && canonicalJson(forcedInput)
                    !== canonicalJson(derivedInput)) {
                throw new SessionConflictError('forcedInput does not match timeoutToAction derivation');
            }
        }
        if (derivedInput.seat !== undefined) {
            if (!this.live.window.participants.includes(derivedInput.seat)) {
                throw new SessionConflictError('timeout system input names a seat outside the open window');
            }
            if (participantId === null) {
                throw new SessionConflictError('window timeout system input cannot name a participant seat');
            }
            if (derivedInput.seat !== participantId) {
                throw new SessionConflictError('timeout system input cannot impersonate another seat');
            }
        }
        if (derivedInput.commit !== undefined
            || derivedInput.reveal !== undefined
            || derivedInput.verifiedPayload !== undefined) {
            throw new SessionConflictError('timeout system input cannot carry commitment verification fields');
        }
        const draft = this.forkLive();
        try {
            if (this.options.reducer.view(draft.reducerState).status !== 'playing') {
                throw new SessionAdvanceError('terminal', 'session is already terminal');
            }
            const windowRef = draft.cursor;
            const action = actionCopy(derivedInput);
            if (participantId !== null)
                action.seat ??= participantId;
            const canonical = {
                participantId,
                submissionId: null,
                action,
            };
            const resolved = this.resolveOnce(draft, 'timeout', [canonical]);
            const rawEvents = [{
                    kind: 'timeout',
                    tick: timeout.tick,
                    timeoutId: timeout.timeoutId,
                    windowRef,
                    participantId,
                    reason: timeout.reason,
                    ...(timeout.timeoutPolicyRef === undefined
                        ? {}
                        : { timeoutPolicyRef: timeout.timeoutPolicyRef }),
                }];
            if (resolved.rejection)
                rawEvents.push(resolved.rejection);
            if (resolved.event)
                rawEvents.push(resolved.event);
            const deltas = resolved.deltas;
            const rejections = resolved.rejection
                ? this.options.seats.map((seat) => ({
                    seat,
                    transitionRevision: this.live.transitionRevision + 1,
                    tick: resolved.rejection.tick,
                    participantId: resolved.rejection.participantId,
                    submissionId: resolved.rejection.submissionId,
                    code: resolved.rejection.code,
                }))
                : [];
            if (resolved.rejection)
                deltas.push(...this.rejectionDeltas(draft, resolved.rejection));
            const digest = this.digestState(draft);
            const checkpointDue = resolved.event
                && draft.tick - draft.lastCheckpointTick >= this.limits.checkpointInterval;
            if (checkpointDue || resolved.rejection) {
                rawEvents.push({ kind: 'checkpoint', tick: draft.tick, digest });
                draft.lastCheckpointTick = draft.tick;
            }
            const result = {
                resolutions: resolved.event ? 1 : 0,
                partial: false,
                cursor: draft.cursor,
                tick: draft.tick,
                digest,
                deltas,
                rejections,
                warnings: resolved.warnings,
            };
            return this.makePrepared(draft, rawEvents, deltas, result);
        }
        catch (error) {
            this.discardDraft(draft);
            throw error;
        }
    }
    prepareExtension(lane, record) {
        if (this.options.reducer.view(this.live.reducerState).status !== 'playing') {
            throw new SessionAdvanceError('terminal', 'session is already terminal');
        }
        if (typeof lane !== 'string' || lane.length === 0) {
            throw new TypeError('lane must be a non-empty string');
        }
        if (!isObjectRecord(record)) {
            throw new TypeError('extension record must be a JSON object');
        }
        const canonical = canonicalJson(record);
        if (utf8Encoder.encode(canonical).length > this.limits.maxExtensionBytes) {
            throw new RangeError('extension record exceeds maxExtensionBytes');
        }
        const draft = this.forkLive();
        try {
            return this.makePrepared(draft, [{
                    kind: 'extension',
                    tick: draft.tick,
                    lane,
                    record: structuredClone(record),
                }], [], undefined);
        }
        catch (error) {
            this.discardDraft(draft);
            throw error;
        }
    }
    prepareInterest(submission) {
        if (this.options.interest === undefined) {
            throw new SessionConflictError('session has no interest policy');
        }
        if (!isObjectRecord(submission))
            throw new TypeError('interest submission must be an object');
        if (submission.protocol !== PROTOCOL_ID || submission.protocolVersion !== PROTOCOL_VERSION) {
            throw new IntentCollectionError('invalid_protocol', `expected ${PROTOCOL_ID} ${PROTOCOL_VERSION}`);
        }
        if (submission.sessionId !== this.options.sessionId) {
            throw new IntentCollectionError('wrong_session', 'submission session does not match endpoint');
        }
        if (!this.options.seats.includes(submission.participantId)) {
            throw new IntentCollectionError('unknown_participant', 'interest names an unknown seat');
        }
        if (!isParticipantId(submission.scopeId)) {
            throw new IntentCollectionError('invalid_submission', 'scopeId must match the portable seat-id pattern');
        }
        if (typeof submission.submissionId !== 'string' || !submission.submissionId.trim()) {
            throw new IntentCollectionError('invalid_submission', 'submissionId is required');
        }
        if (submission.revision !== this.live.cursor || submission.tickId !== this.live.window.tickId) {
            throw new IntentCollectionError('stale_tick', 'interest cursor does not match the open window');
        }
        let canonicalCommand;
        try {
            canonicalCommand = canonicalJson({
                kind: 'interest',
                scopeId: submission.scopeId,
                declaration: submission.declaration,
            });
        }
        catch (error) {
            throw new IntentCollectionError('invalid_submission', error instanceof Error ? error.message : 'interest declaration must be JSON');
        }
        const key = receiptKey(submission.participantId, submission.submissionId);
        const prior = this.historicalInterestCommands.get(key)
            ?? this.historyLookup?.interestCommand(submission.participantId, submission.submissionId);
        const receipt = {
            status: prior === undefined ? 'accepted' : 'duplicate',
            participantId: submission.participantId,
            submissionId: submission.submissionId,
            scopeId: submission.scopeId,
            cursor: this.live.cursor,
            tick: this.live.tick,
        };
        if (prior !== undefined) {
            if (prior !== canonicalCommand) {
                throw new SessionConflictError('interest submission id was reused with different content');
            }
            const draft = this.forkLive();
            try {
                return this.makePrepared(draft, [], [], receipt, true);
            }
            catch (error) {
                this.discardDraft(draft);
                throw error;
            }
        }
        if (this.historicalSubmissionKeys.has(key)
            || this.historyLookup?.gameplaySubmission(submission.participantId, submission.submissionId)) {
            throw new SessionConflictError('submission id was already used by a gameplay command');
        }
        if (this.header.signaturePolicy !== undefined) {
            if (submission.clientTime === undefined
                || submission.prevChainHash === undefined
                || submission.sig === undefined) {
                throw new IntentCollectionError('invalid_submission', 'interest changes require a tier-2 signature in signed sessions');
            }
            if (!Number.isSafeInteger(submission.clientTime) || submission.clientTime < 0) {
                throw new IntentCollectionError('invalid_submission', 'clientTime must be a non-negative safe integer');
            }
            try {
                signatureBytesFromBase64(submission.prevChainHash, 'prevChainHash', 32);
                signatureBytesFromBase64(submission.sig, 'sig', 64);
            }
            catch (error) {
                throw new IntentCollectionError('invalid_submission', error instanceof Error ? error.message : String(error));
            }
        }
        const existingScope = this.live.interestScopes.get(interestScopeKey(submission.participantId, submission.scopeId));
        if (existingScope === undefined) {
            const count = [...this.live.interestScopes.values()].filter((scope) => scope.participantId === submission.participantId).length;
            if (count >= (this.options.interest.maxScopesPerSeat ?? 8)) {
                throw new SessionConflictError('interest scope limit reached for seat');
            }
        }
        const fullView = this.live.views.get(submission.participantId);
        const nextScope = this.scopedView(fullView, {
            participantId: submission.participantId,
            scopeId: submission.scopeId,
            declaration: submission.declaration,
        }, this.live.cursor, this.live.tick);
        const draft = this.forkLive();
        try {
            draft.interestScopes.set(interestScopeKey(submission.participantId, submission.scopeId), {
                participantId: submission.participantId,
                scopeId: submission.scopeId,
                declared: true,
                declaration: structuredClone(submission.declaration),
                view: nextScope.view,
                canonical: nextScope.canonical,
                patchBackoffRemaining: 0,
                patchBackoffWindow: this.observationCodec.patchBackoffTicks,
            });
            const delta = {
                seat: submission.participantId,
                scopeId: submission.scopeId,
                interest: { declaration: structuredClone(submission.declaration) },
                transitionRevision: draft.transitionRevision + 1,
                viewRevision: draft.viewRevisions.get(submission.participantId),
                tick: draft.tick,
                codec: 'v2',
                origin: 'interest',
                acknowledgements: [],
                rejections: [],
                body: { kind: 'snapshot', view: structuredClone(nextScope.view) },
                viewDigest: fnv1a(nextScope.canonical),
            };
            return this.makePrepared(draft, [{
                    kind: 'interest',
                    tick: draft.tick,
                    cursor: draft.cursor,
                    participantId: submission.participantId,
                    submissionId: submission.submissionId,
                    scopeId: submission.scopeId,
                    declaration: structuredClone(submission.declaration),
                    canonicalCommand,
                    ...(submission.clientTime === undefined ? {} : { clientTime: submission.clientTime }),
                    ...(submission.prevChainHash === undefined
                        ? {}
                        : { prevChainHash: submission.prevChainHash }),
                    ...(submission.sig === undefined ? {} : { sig: submission.sig }),
                }], [delta], receipt);
        }
        catch (error) {
            this.discardDraft(draft);
            throw error;
        }
    }
    prepareSeatSignature(input) {
        if (this.header.signaturePolicy === undefined) {
            throw new SessionConflictError('session has no RFC-010 signature policy');
        }
        if (!isObjectRecord(input))
            throw new TypeError('seat signature must be an object');
        if (!this.options.seats.includes(input.participantId)) {
            throw new SessionConflictError('seat signature names an unknown participant');
        }
        if (!Number.isSafeInteger(input.tick) || input.tick !== this.live.tick) {
            throw new SessionConflictError('seat signature tick must equal the current session tick');
        }
        if (!Number.isSafeInteger(input.clientTime) || input.clientTime < 0) {
            throw new TypeError('seat signature clientTime must be a non-negative safe integer');
        }
        signatureBytesFromBase64(input.prevChainHash, 'prevChainHash', 32);
        signatureBytesFromBase64(input.sig, 'sig', 64);
        const draft = this.forkLive();
        try {
            return this.makePrepared(draft, [{
                    kind: 'seat-signature',
                    tick: input.tick,
                    participantId: input.participantId,
                    clientTime: input.clientTime,
                    prevChainHash: input.prevChainHash,
                    sig: input.sig,
                }], [], undefined);
        }
        catch (error) {
            this.discardDraft(draft);
            throw error;
        }
    }
    commit(prepared) {
        const state = this.preparedState(prepared);
        if (prepared.baseTransitionRevision !== this.live.transitionRevision) {
            state.completion = 'aborted';
            for (const draft of state.drafts)
                this.isolation.discard?.(draft);
            throw new PreparedTransitionError('stale', `prepared base revision ${prepared.baseTransitionRevision} `
                + `does not match live revision ${this.live.transitionRevision}`);
        }
        if (state.noop) {
            state.completion = 'committed';
            for (const draft of state.drafts)
                this.isolation.discard?.(draft);
            return;
        }
        const previous = this.live.reducerState;
        this.live = state.next;
        for (const event of prepared.events) {
            if (event.kind === 'intent-accepted' || event.kind === 'interest') {
                this.historicalSubmissionKeys.add(receiptKey(event.participantId, event.submissionId));
                if (event.kind === 'interest') {
                    this.historicalInterestCommands.set(receiptKey(event.participantId, event.submissionId), event.canonicalCommand);
                }
            }
        }
        state.completion = 'committed';
        for (const draft of state.drafts) {
            if (draft !== state.next.reducerState)
                this.isolation.discard?.(draft);
        }
        this.isolation.retire?.(previous);
    }
    abort(prepared) {
        const state = this.preparedState(prepared, true);
        if (state.completion === 'aborted')
            return;
        state.completion = 'aborted';
        for (const draft of state.drafts)
            this.isolation.discard?.(draft);
    }
    observe(seat, scopeId = seat) {
        const scope = this.live.interestScopes.get(interestScopeKey(seat, scopeId));
        if (scope === undefined)
            throw new RangeError(`unknown interest scope ${seat}/${scopeId}`);
        return structuredClone(scope.view);
    }
    observeAll() {
        return Object.freeze(Object.fromEntries(this.options.seats.map((seat) => [seat, this.observe(seat)])));
    }
    awaitingSeats() {
        return Object.freeze(this.live.window.participants.filter((seat) => !Object.hasOwn(this.live.window.intents, seat)));
    }
    cursor() {
        return this.live.cursor;
    }
    tick() {
        return this.live.tick;
    }
    nextDeadline() {
        if (this.tickTimeoutPolicy === undefined
            || this.live.window.participants.every((seat) => Object.hasOwn(this.live.window.intents, seat))) {
            return undefined;
        }
        return this.live.tick + this.tickTimeoutPolicy.windowTicks;
    }
    viewRevision(seat) {
        const revision = this.live.viewRevisions.get(seat);
        if (revision === undefined)
            throw new RangeError(`unknown seat ${seat}`);
        return revision;
    }
    snapshot(seat, afterTransitionRevision, scopeId = seat) {
        const requested = afterTransitionRevision ?? this.compactedRetentionFloor;
        if (!Number.isSafeInteger(requested)
            || requested < 0
            || requested > this.live.transitionRevision) {
            throw new RangeError('afterTransitionRevision must identify committed session history');
        }
        if (requested < this.compactedRetentionFloor) {
            return {
                status: 'resync_required',
                requestedTransitionRevision: requested,
                retentionFloor: this.compactedRetentionFloor,
                currentTransitionRevision: this.live.transitionRevision,
            };
        }
        const scope = this.live.interestScopes.get(interestScopeKey(seat, scopeId));
        if (scope === undefined)
            throw new RangeError(`unknown interest scope ${seat}/${scopeId}`);
        const view = structuredClone(scope.view);
        return {
            seat,
            scopeId,
            ...(scope.declared
                ? { interest: { declaration: structuredClone(scope.declaration) } }
                : {}),
            transitionRevision: this.live.transitionRevision,
            viewRevision: this.viewRevision(seat),
            tick: this.live.tick,
            codec: 'v2',
            origin: 'snapshot',
            acknowledgements: [],
            rejections: this.rejectionNoticesSince(seat, requested),
            body: { kind: 'snapshot', view },
            viewDigest: viewDigest(view),
        };
    }
    checkpoint() {
        let reducerState;
        try {
            reducerState = this.checkpointCodec.encode(this.live.reducerState);
            assertJsonValue(reducerState, 'checkpoint reducerState');
        }
        catch (error) {
            throw new TypeError(`checkpoint codec could not encode reducer state: `
                + `${error instanceof Error ? error.message : String(error)}`);
        }
        const withoutIntegrity = {
            format: 'gaos.kernel-checkpoint',
            formatVersion: '1.0',
            header: structuredClone(this.header),
            codec: {
                id: this.checkpointCodec.id,
                version: this.checkpointCodec.version,
            },
            watermark: {
                transitionRevision: this.live.transitionRevision,
                cursor: this.live.cursor,
                tick: this.live.tick,
                lastCheckpointTick: this.live.lastCheckpointTick,
            },
            reducerState: structuredClone(reducerState),
            window: structuredClone(this.live.window),
            protocol: {
                receipts: sortedEntries(this.live.receipts).map(([key, receipt]) => ({
                    key,
                    ...structuredClone(receipt),
                })),
                expiredReceiptKeys: [...this.live.expiredReceiptKeys]
                    .sort(compareUnicodeCodePoints),
                views: sortedEntries(this.live.views).map(([seat, view]) => ({
                    seat,
                    view: structuredClone(view),
                    canonical: this.live.viewCanonical.get(seat),
                    revision: this.live.viewRevisions.get(seat),
                })),
                commitments: sortedEntries(this.live.commitments).map(([key, value]) => ({
                    key,
                    value: structuredClone(value),
                })),
                nextCommitmentIds: sortedEntries(this.live.nextCommitmentIds),
                seenSalts: sortedEntries(this.live.seenSalts),
                interests: sortedEntries(this.live.interestScopes).map(([key, scope]) => ({
                    key,
                    participantId: scope.participantId,
                    scopeId: scope.scopeId,
                    declared: scope.declared,
                    declaration: structuredClone(scope.declaration),
                    view: structuredClone(scope.view),
                    canonical: scope.canonical,
                    patchBackoffRemaining: scope.patchBackoffRemaining,
                    patchBackoffWindow: scope.patchBackoffWindow,
                })),
                rejections: structuredClone(this.live.rejectionHistory),
                historicalSubmissionKeys: [...this.historicalSubmissionKeys]
                    .sort(compareUnicodeCodePoints),
                historicalInterestCommands: sortedEntries(this.historicalInterestCommands),
            },
            retentionFloor: this.compactedRetentionFloor,
            stateDigest: this.digestState(this.live),
        };
        return deepFreeze({
            ...withoutIntegrity,
            integrityDigest: checkpointIntegrityDigest(withoutIntegrity),
        });
    }
    compact(checkpoint, confirmation) {
        if (!isObjectRecord(confirmation)
            || confirmation.checkpointDurablyCommitted !== true
            || confirmation.historyDurablyCommitted !== true) {
            throw new TypeError('compaction requires durable checkpoint and permanent-history confirmation');
        }
        const current = this.checkpoint();
        if (checkpoint.integrityDigest !== current.integrityDigest
            || confirmation.checkpointDigest !== current.integrityDigest) {
            throw new SessionConflictError('compaction checkpoint does not match current kernel state');
        }
        if (this.historyLookup === undefined) {
            throw new TypeError('compaction requires a host-backed historyLookup');
        }
        this.live.events = [];
        this.live.rejectionHistory = [];
        this.live.expiredReceiptKeys.clear();
        this.historicalSubmissionKeys.clear();
        this.historicalInterestCommands.clear();
        this.live.seenSalts.clear();
        for (const [key, commitment] of this.live.commitments) {
            if (commitment.revealed)
                this.live.commitments.delete(key);
        }
        this.compactedRetentionFloor = this.live.transitionRevision;
    }
    retentionFloor() {
        return this.compactedRetentionFloor;
    }
    sessionHeader() {
        return structuredClone(this.header);
    }
    liveTranscript() {
        return {
            header: structuredClone(this.header),
            events: structuredClone(this.live.events),
        };
    }
    digestState(state) {
        const views = [...state.viewCanonical]
            .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
            .map(([seat, canonicalView]) => `${canonicalJson(seat)}:${canonicalView}`)
            .join(',');
        return fnv1a(`{"cursor":${state.cursor},"tick":${state.tick},"views":{${views}}}`);
    }
    digest() {
        return this.digestState(this.live);
    }
    restoreCheckpoint(checkpoint) {
        if (!isObjectRecord(checkpoint)
            || checkpoint.format !== 'gaos.kernel-checkpoint'
            || checkpoint.formatVersion !== '1.0') {
            throw new TypeError('checkpoint must be a gaos.kernel-checkpoint v1.0 object');
        }
        if (canonicalJson(checkpoint.header)
            !== canonicalJson(this.header)) {
            throw new TypeError('checkpoint header does not match kernel options');
        }
        if (checkpoint.codec?.id !== this.checkpointCodec.id
            || checkpoint.codec?.version !== this.checkpointCodec.version) {
            throw new TypeError('checkpoint codec does not match kernel options');
        }
        const { integrityDigest, ...withoutIntegrity } = checkpoint;
        if (!/^[0-9a-f]{64}$/.test(integrityDigest)
            || checkpointIntegrityDigest(withoutIntegrity) !== integrityDigest) {
            throw new TypeError('checkpoint integrity digest mismatch');
        }
        const watermark = checkpoint.watermark;
        if (!isObjectRecord(watermark)
            || !Number.isSafeInteger(watermark.transitionRevision)
            || watermark.transitionRevision < 0
            || !Number.isSafeInteger(watermark.cursor)
            || watermark.cursor < 0
            || !Number.isSafeInteger(watermark.tick)
            || watermark.tick < 0
            || !Number.isSafeInteger(watermark.lastCheckpointTick)
            || watermark.lastCheckpointTick < 0
            || watermark.lastCheckpointTick > watermark.tick
            || !Number.isSafeInteger(checkpoint.retentionFloor)
            || checkpoint.retentionFloor < 0
            || checkpoint.retentionFloor > watermark.transitionRevision) {
            throw new TypeError('checkpoint watermarks are invalid');
        }
        if (checkpoint.window.sessionId !== this.options.sessionId
            || checkpoint.window.revision !== watermark.cursor
            || checkpoint.window.tickId !== makeTickId(this.options.sessionId, watermark.cursor)) {
            throw new TypeError('checkpoint intent window does not match its watermark');
        }
        const protocol = checkpoint.protocol;
        if (!isObjectRecord(protocol)
            || !Array.isArray(protocol.receipts)
            || !Array.isArray(protocol.expiredReceiptKeys)
            || !Array.isArray(protocol.views)
            || !Array.isArray(protocol.commitments)
            || !Array.isArray(protocol.nextCommitmentIds)
            || !Array.isArray(protocol.seenSalts)
            || !Array.isArray(protocol.interests)
            || !Array.isArray(protocol.rejections)
            || !Array.isArray(protocol.historicalSubmissionKeys)
            || !Array.isArray(protocol.historicalInterestCommands)) {
            throw new TypeError('checkpoint protocol payload is invalid');
        }
        let previousRejectionRevision = checkpoint.retentionFloor;
        for (const rejection of protocol.rejections) {
            if (!isObjectRecord(rejection)
                || !Number.isSafeInteger(rejection.transitionRevision)
                || rejection.transitionRevision <= checkpoint.retentionFloor
                || rejection.transitionRevision > watermark.transitionRevision
                || rejection.transitionRevision < previousRejectionRevision
                || !Number.isSafeInteger(rejection.tick)
                || rejection.tick < 0
                || typeof rejection.participantId !== 'string'
                || !this.options.seats.includes(rejection.participantId)
                || typeof rejection.submissionId !== 'string'
                || !rejection.submissionId
                || rejection.code !== 'commit_mismatch') {
                throw new TypeError('checkpoint rejection history is invalid');
            }
            previousRejectionRevision = rejection.transitionRevision;
        }
        let reducerState;
        try {
            reducerState = this.checkpointCodec.decode(structuredClone(checkpoint.reducerState));
            const probe = this.isolation.fork(reducerState);
            this.isolation.discard?.(probe);
        }
        catch (error) {
            throw new TypeError(`checkpoint codec could not restore reducer state: `
                + `${error instanceof Error ? error.message : String(error)}`);
        }
        const receipts = new Map(protocol.receipts.map((receipt) => [
            receipt.key,
            {
                canonicalCommand: receipt.canonicalCommand,
                tickId: receipt.tickId,
                receipt: structuredClone(receipt.receipt),
                cursor: receipt.cursor,
            },
        ]));
        const views = new Map(protocol.views.map(({ seat, view }) => [
            seat,
            structuredClone(view),
        ]));
        const viewCanonical = new Map(protocol.views.map(({ seat, canonical }) => [
            seat,
            canonical,
        ]));
        const viewRevisions = new Map(protocol.views.map(({ seat, revision }) => [
            seat,
            revision,
        ]));
        if (views.size !== this.options.seats.length
            || this.options.seats.some((seat) => !views.has(seat))) {
            throw new TypeError('checkpoint views must name every session seat exactly once');
        }
        for (const seat of this.options.seats) {
            if (canonicalSessionView(views.get(seat))
                !== viewCanonical.get(seat)) {
                throw new TypeError(`checkpoint view canonical form mismatch for seat ${seat}`);
            }
        }
        const commitments = new Map(protocol.commitments.map(({ key, value }) => [
            key,
            structuredClone(value),
        ]));
        const nextCommitmentIds = new Map(protocol.nextCommitmentIds);
        const seenSalts = new Map(protocol.seenSalts);
        const interestScopes = new Map(protocol.interests.map((scope) => [
            scope.key,
            {
                participantId: scope.participantId,
                scopeId: scope.scopeId,
                declared: scope.declared,
                declaration: structuredClone(scope.declaration),
                view: structuredClone(scope.view),
                canonical: scope.canonical,
                patchBackoffRemaining: scope.patchBackoffRemaining,
                patchBackoffWindow: scope.patchBackoffWindow,
            },
        ]));
        this.live = {
            reducerState,
            window: structuredClone(checkpoint.window),
            transitionRevision: watermark.transitionRevision,
            cursor: watermark.cursor,
            tick: watermark.tick,
            lastCheckpointTick: watermark.lastCheckpointTick,
            events: [],
            rejectionHistory: structuredClone(protocol.rejections),
            receipts,
            expiredReceiptKeys: new Set(protocol.expiredReceiptKeys),
            views,
            viewCanonical,
            viewRevisions,
            commitments,
            nextCommitmentIds,
            seenSalts,
            interestScopes,
        };
        this.historicalSubmissionKeys.clear();
        for (const key of protocol.historicalSubmissionKeys) {
            this.historicalSubmissionKeys.add(key);
        }
        this.historicalInterestCommands.clear();
        for (const [key, command] of protocol.historicalInterestCommands) {
            this.historicalInterestCommands.set(key, command);
        }
        this.compactedRetentionFloor = checkpoint.retentionFloor;
        if (this.digestState(this.live) !== checkpoint.stateDigest) {
            throw new TypeError('checkpoint final state digest mismatch');
        }
        const restoredView = this.options.reducer.view(this.live.reducerState);
        this.validatedParticipantsForView(restoredView);
    }
    rehydrate(transcript) {
        if (!isObjectRecord(transcript)) {
            throw new TypeError('transcript must be an object');
        }
        if (canonicalJson(transcript.header) !== canonicalJson(this.header)) {
            throw new TypeError('transcript header does not match kernel options');
        }
        const events = [...transcript.events];
        validateTimeoutAudit(transcript.header, events);
        let previousTransitionRevision = 0;
        for (const event of events) {
            if (event.hostTime !== undefined
                && (!Number.isSafeInteger(event.hostTime) || event.hostTime < 0)) {
                throw new TypeError('session event hostTime must be non-negative UTC epoch milliseconds');
            }
            if (event.transitionRevision < previousTransitionRevision) {
                throw new TypeError('transcript transition revisions must be monotonic');
            }
            previousTransitionRevision = event.transitionRevision;
            if (event.kind === 'intent-accepted') {
                this.historicalSubmissionKeys.add(receiptKey(event.participantId, event.submissionId));
                const submission = {
                    protocol: PROTOCOL_ID,
                    protocolVersion: PROTOCOL_VERSION,
                    sessionId: this.options.sessionId,
                    tickId: this.live.window.tickId,
                    revision: this.live.window.revision,
                    participantId: event.participantId,
                    submissionId: event.submissionId,
                    command: structuredClone(event.command),
                    ...(event.clientTime === undefined ? {} : { clientTime: event.clientTime }),
                    ...(event.prevChainHash === undefined
                        ? {}
                        : { prevChainHash: event.prevChainHash }),
                    ...(event.sig === undefined ? {} : { sig: event.sig }),
                };
                const collected = collectIntent(this.live.window, submission);
                this.live.window = collected.window;
                const submittedParticipants = this.live.window.participants.filter((seat) => Object.hasOwn(this.live.window.intents, seat));
                const awaitingParticipants = this.live.window.participants.filter((seat) => !Object.hasOwn(this.live.window.intents, seat));
                const receipt = {
                    status: 'accepted',
                    participantId: event.participantId,
                    submissionId: event.submissionId,
                    cursor: event.revision,
                    tick: event.tick,
                    submittedParticipants,
                    awaitingParticipants,
                    resolved: event.revision < this.live.cursor,
                };
                this.live.receipts.set(receiptKey(event.participantId, event.submissionId), {
                    canonicalCommand: event.canonicalCommand,
                    tickId: submission.tickId,
                    receipt,
                    cursor: event.revision,
                });
            }
            else if (event.kind === 'interest') {
                if (this.options.interest === undefined) {
                    throw new TypeError('transcript contains interest but options have no interest policy');
                }
                if (!this.options.seats.includes(event.participantId)
                    || !isParticipantId(event.scopeId)
                    || !Number.isSafeInteger(event.cursor)
                    || event.cursor !== this.live.cursor) {
                    throw new TypeError('transcript contains an invalid interest event');
                }
                const expectedCanonical = canonicalJson({
                    kind: 'interest',
                    scopeId: event.scopeId,
                    declaration: event.declaration,
                });
                if (event.canonicalCommand !== expectedCanonical) {
                    throw new TypeError('interest canonicalCommand does not match its declaration');
                }
                const key = receiptKey(event.participantId, event.submissionId);
                if (this.historicalSubmissionKeys.has(key)) {
                    throw new TypeError('transcript reuses an interest submission id');
                }
                this.historicalSubmissionKeys.add(key);
                this.historicalInterestCommands.set(key, expectedCanonical);
                const scoped = this.scopedView(this.live.views.get(event.participantId), event, this.live.cursor, this.live.tick);
                this.live.interestScopes.set(interestScopeKey(event.participantId, event.scopeId), {
                    participantId: event.participantId,
                    scopeId: event.scopeId,
                    declared: true,
                    declaration: structuredClone(event.declaration),
                    view: scoped.view,
                    canonical: scoped.canonical,
                    patchBackoffRemaining: 0,
                    patchBackoffWindow: this.observationCodec.patchBackoffTicks,
                });
            }
            else if (event.kind === 'resolution') {
                for (const { participantId, action } of event.inputs) {
                    if (!participantId)
                        continue;
                    if (action.commit) {
                        const expected = this.live.nextCommitmentIds.get(participantId) ?? 0;
                        if (action.commit.commitmentId !== expected) {
                            throw new TypeError(`transcript commitmentId ${action.commit.commitmentId} must be ${expected}`);
                        }
                        this.live.commitments.set(commitmentKey(participantId, expected), {
                            envelope: structuredClone(action.commit),
                            seat: participantId,
                            windowRef: event.tick,
                            revealed: false,
                        });
                        this.live.nextCommitmentIds.set(participantId, expected + 1);
                    }
                    else if (action.reveal) {
                        const identity = commitmentKey(participantId, action.reveal.commitmentId);
                        this.live.seenSalts.set(action.reveal.salt, this.live.seenSalts.get(action.reveal.salt) ?? identity);
                        const commitment = this.live.commitments.get(commitmentKey(participantId, action.reveal.commitmentId));
                        if (!commitment || commitment.revealed) {
                            throw new TypeError('transcript reveal references an unknown or revealed commitment');
                        }
                        const actual = createCommitmentHash({
                            sessionId: this.options.sessionId,
                            seat: participantId,
                            commitmentId: commitment.envelope.commitmentId,
                            windowRef: commitment.windowRef,
                        }, action.reveal.salt, action.reveal.payload);
                        if (actual !== commitment.envelope.hash) {
                            throw new TypeError('transcript contains an unrecorded commitment mismatch');
                        }
                        commitment.revealed = true;
                    }
                }
                this.live.reducerState = advanceTick(this.options.reducer, this.live.reducerState, event.inputs.map(({ action }) => actionCopy(action)));
                this.live.cursor = event.cursor + 1;
                this.live.tick = event.tick + 1;
                const view = this.options.reducer.view(this.live.reducerState);
                this.live.window = createIntentWindow(this.options.sessionId, this.live.cursor, this.validatedParticipantsForView(view));
                for (const seat of this.options.seats) {
                    const seatView = this.viewFor(this.live.reducerState, seat);
                    this.live.views.set(seat, seatView);
                    const canonical = canonicalSessionView(seatView);
                    this.live.viewCanonical.set(seat, canonical);
                    this.live.viewRevisions.set(seat, (this.live.viewRevisions.get(seat) ?? 0) + 1);
                    for (const scope of this.live.interestScopes.values()) {
                        if (scope.participantId !== seat)
                            continue;
                        const scoped = this.scopedView(seatView, scope, this.live.cursor, this.live.tick);
                        scope.view = scoped.view;
                        scope.canonical = scoped.canonical;
                    }
                }
                this.evictReceipts(this.live);
            }
            else if (event.kind === 'rejection') {
                this.live.rejectionHistory.push({
                    transitionRevision: event.transitionRevision,
                    tick: event.tick,
                    participantId: event.participantId,
                    submissionId: event.submissionId,
                    code: event.code,
                });
                const identity = commitmentKey(event.participantId, event.commitmentId);
                this.live.seenSalts.set(event.attemptedReveal.salt, this.live.seenSalts.get(event.attemptedReveal.salt) ?? identity);
                const intents = { ...this.live.window.intents };
                delete intents[event.participantId];
                this.live.window = { ...this.live.window, intents };
                this.live.receipts.delete(receiptKey(event.participantId, event.submissionId));
            }
            else if (event.kind === 'seat-signature') {
                if (!this.options.seats.includes(event.participantId)
                    || !Number.isSafeInteger(event.tick)
                    || event.tick < 0
                    || !Number.isSafeInteger(event.clientTime)
                    || event.clientTime < 0) {
                    throw new TypeError('transcript contains an invalid seat-signature event');
                }
                signatureBytesFromBase64(event.prevChainHash, 'prevChainHash', 32);
                signatureBytesFromBase64(event.sig, 'sig', 64);
            }
            else if (event.kind === 'checkpoint') {
                if (event.tick !== this.live.tick || event.digest !== this.digestState(this.live)) {
                    throw new TypeError('transcript checkpoint digest does not match reconstructed state');
                }
                this.live.lastCheckpointTick = event.tick;
            }
            this.live.transitionRevision = Math.max(this.live.transitionRevision, event.transitionRevision);
            this.live.events.push(structuredClone(event));
        }
    }
}
/** Create a new synchronous, IO-free authoritative session kernel. */
export function createSessionKernel(options) {
    return new SessionKernelImpl(options);
}
/** Reconstruct a kernel from its durable accepted-intent and resolution log. */
export function rehydrateKernel(options, transcript) {
    if (!Array.isArray(transcript) && !isObjectRecord(transcript)) {
        throw new TypeError('transcript must be an object or an event array');
    }
    return new SessionKernelImpl(options, Array.isArray(transcript)
        ? { header: sessionHeaderFor(options), events: transcript }
        : transcript);
}
/** Restore live state from a durable checkpoint and its contiguous event tail. */
export function rehydrateKernelFromCheckpoint(options, checkpoint, tail) {
    if (!Array.isArray(tail))
        throw new TypeError('checkpoint tail must be an event array');
    let expectedRevision = checkpoint.watermark.transitionRevision + 1;
    let expectedIndex = 0;
    let seenEvent = false;
    for (const event of tail) {
        if (event.transitionRevision <= checkpoint.watermark.transitionRevision) {
            throw new TypeError('checkpoint tail contains an event at or before its watermark');
        }
        if (!seenEvent && event.transitionRevision !== expectedRevision) {
            throw new TypeError('checkpoint tail transition revisions are not contiguous');
        }
        if (event.transitionRevision === expectedRevision) {
            // Continue the current committed transition.
        }
        else if (event.transitionRevision === expectedRevision + 1) {
            expectedRevision++;
            expectedIndex = 0;
        }
        else {
            throw new TypeError('checkpoint tail transition revisions are not contiguous');
        }
        if (event.eventId !== eventId(options.sessionId, expectedRevision, expectedIndex)) {
            throw new TypeError('checkpoint tail event ids are not contiguous');
        }
        expectedIndex++;
        seenEvent = true;
    }
    return new SessionKernelImpl(options, { header: structuredClone(checkpoint.header), events: tail }, checkpoint);
}
function replayInput(input, perm) {
    const action = input.action;
    const canonicalMatch = /^Action ([1-9]\d*)$/.exec(action.id);
    const canonicalIndex = canonicalMatch ? Number(canonicalMatch[1]) - 1 : -1;
    const wireIndex = perm.indexOf(canonicalIndex);
    return {
        wireId: wireIndex < 0 ? action.id : `Action ${wireIndex + 1}`,
        canonicalId: action.id,
        ...(action.payload === undefined ? {} : { payload: structuredClone(action.payload) }),
        ...(action.x === undefined ? {} : { x: action.x }),
        ...(action.y === undefined ? {} : { y: action.y }),
        ...(action.index === undefined ? {} : { index: action.index }),
        ...(action.boardId === undefined ? {} : { boardId: action.boardId }),
        ...(action.zoneId === undefined ? {} : { zoneId: action.zoneId }),
        ...(action.seat === undefined ? {} : { seat: action.seat }),
        ...(action.targets === undefined ? {} : { targets: action.targets }),
        ...(action.commit === undefined ? {} : { commit: action.commit }),
        ...(action.reveal === undefined ? {} : { reveal: action.reveal }),
        ...(action.verifiedPayload === undefined ? {} : { verifiedPayload: action.verifiedPayload }),
        ...(input.submissionId === null ? {} : { submissionId: input.submissionId }),
        ...(input.canonicalCommand === undefined
            ? {}
            : { canonicalCommand: input.canonicalCommand }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.clientTime === undefined ? {} : { clientTime: input.clientTime }),
        ...(input.prevChainHash === undefined ? {} : { prevChainHash: input.prevChainHash }),
        ...(input.sig === undefined ? {} : { sig: input.sig }),
    };
}
function timeoutSystemInput(event) {
    return event.systemInput
        ?? [...event.inputs].reverse().find((input) => input.submissionId === null);
}
function validateTimeoutAudit(header, events) {
    for (const [index, event] of events.entries()) {
        if (event.kind === 'timeout') {
            if (typeof event.timeoutId !== 'string' || event.timeoutId.length === 0) {
                throw new TypeError('timeout audit event must name a non-empty timeoutId');
            }
            if (typeof event.reason !== 'string' || event.reason.length === 0) {
                throw new TypeError('timeout audit event must name a non-empty reason');
            }
            if (event.timeoutPolicyRef !== undefined
                && (typeof event.timeoutPolicyRef !== 'string'
                    || event.timeoutPolicyRef.length === 0)) {
                throw new TypeError('timeout audit event timeoutPolicyRef must be non-empty');
            }
            const policy = header.seatKeys !== undefined
                && isReplayTickTimeoutPolicy(header.timeoutPolicy)
                ? header.timeoutPolicy
                : undefined;
            if (policy === undefined) {
                if (event.tick !== event.windowRef) {
                    throw new TypeError('timeout without a tick-bounded policy must identify the open tick');
                }
            }
            else if (event.timeoutPolicyRef !== GAOS_TIMEOUT_POLICY_REF
                || event.tick !== event.windowRef + policy.windowTicks) {
                throw new TypeError('timeout must occur at the declared header timeout-policy position');
            }
            if (event.participantId !== null && !header.seats.includes(event.participantId)) {
                throw new TypeError('timeout audit participant must be a declared session seat');
            }
            const outcome = events[index + 1];
            if (outcome?.kind === 'rejection') {
                if (outcome.transitionRevision !== event.transitionRevision
                    || outcome.tick !== event.windowRef) {
                    throw new TypeError('timeout audit event must immediately precede its matching rejection');
                }
                continue;
            }
            if (outcome?.kind !== 'resolution'
                || outcome.cause !== 'timeout'
                || outcome.transitionRevision !== event.transitionRevision
                || outcome.tick !== event.windowRef
                || outcome.cursor !== event.windowRef) {
                throw new TypeError('timeout audit event must immediately precede its matching resolution or rejection');
            }
            const systemInput = timeoutSystemInput(outcome);
            if (!systemInput || systemInput.participantId !== event.participantId) {
                throw new TypeError('timeout audit participant must match the recorded system input');
            }
            if (event.participantId === null && systemInput.action.seat !== undefined) {
                throw new TypeError('window timeout audit input cannot name a participant seat');
            }
            if (event.participantId !== null
                && systemInput.action.seat !== event.participantId) {
                throw new TypeError('timeout audit participant must match the system action seat');
            }
        }
        else if (event.kind === 'resolution' && event.cause === 'timeout') {
            const timeout = events[index - 1];
            if (timeout?.kind !== 'timeout'
                || timeout.transitionRevision !== event.transitionRevision) {
                throw new TypeError('timeout resolution must immediately follow its audit event');
            }
        }
    }
}
/** Purely project a terminal live transcript into portable replay v1.1 or v1.2. */
export function finalizeReplay(transcript, options) {
    if (!isObjectRecord(transcript)) {
        throw new TypeError('transcript must be an object');
    }
    if (!isObjectRecord(options)) {
        throw new TypeError('finalize options must be an object');
    }
    validateTimeoutAudit(transcript.header, transcript.events);
    const resolutions = transcript.events.filter((event) => event.kind === 'resolution');
    const terminal = resolutions.at(-1);
    if (!terminal || terminal.result.status === 'playing') {
        throw new SessionAdvanceError('terminal', 'only a terminal transcript can be finalized');
    }
    const records = [];
    for (const event of transcript.events) {
        if (event.kind === 'resolution') {
            const systemInput = event.cause === 'timeout'
                ? timeoutSystemInput(event)
                : undefined;
            records.push({
                kind: 'resolution',
                n: records.length,
                levelIndex: 0,
                tick: event.tick,
                inputs: event.inputs.map((input) => replayInput(input, options.perm)),
                cause: event.cause,
                ...(options.includeHostTime && event.hostTime !== undefined
                    ? { hostTime: event.hostTime }
                    : {}),
                ...(event.cause === 'timeout' && systemInput
                    ? { systemInput: replayInput(systemInput, options.perm) }
                    : {}),
            });
        }
        else if (event.kind === 'timeout') {
            records.push({
                kind: 'timeout',
                n: records.length,
                levelIndex: 0,
                tick: event.tick,
                timeoutId: event.timeoutId,
                windowRef: event.windowRef,
                participantId: event.participantId,
                reason: event.reason,
                ...(event.timeoutPolicyRef === undefined
                    ? {}
                    : { timeoutPolicyRef: event.timeoutPolicyRef }),
                ...(options.includeHostTime && event.hostTime !== undefined
                    ? { hostTime: event.hostTime }
                    : {}),
            });
        }
        else if (event.kind === 'extension') {
            records.push({
                kind: 'extension',
                n: records.length,
                levelIndex: 0,
                lane: event.lane,
                record: structuredClone(event.record),
                ...(options.includeHostTime && event.hostTime !== undefined
                    ? { hostTime: event.hostTime }
                    : {}),
            });
        }
        else if (event.kind === 'interest') {
            records.push({
                kind: 'interest',
                n: records.length,
                levelIndex: 0,
                tick: event.tick,
                cursor: event.cursor,
                participantId: event.participantId,
                submissionId: event.submissionId,
                scopeId: event.scopeId,
                declaration: structuredClone(event.declaration),
                canonicalCommand: event.canonicalCommand,
                ...(event.clientTime === undefined ? {} : { clientTime: event.clientTime }),
                ...(event.prevChainHash === undefined
                    ? {}
                    : { prevChainHash: event.prevChainHash }),
                ...(event.sig === undefined ? {} : { sig: event.sig }),
                ...(options.includeHostTime && event.hostTime !== undefined
                    ? { hostTime: event.hostTime }
                    : {}),
            });
        }
        else if (event.kind === 'seat-signature') {
            records.push({
                kind: 'seat-signature',
                n: records.length,
                levelIndex: 0,
                tick: event.tick,
                participantId: event.participantId,
                clientTime: event.clientTime,
                prevChainHash: event.prevChainHash,
                sig: event.sig,
                ...(options.includeHostTime && event.hostTime !== undefined
                    ? { hostTime: event.hostTime }
                    : {}),
            });
        }
        else if (event.kind === 'checkpoint') {
            records.push({
                kind: 'checkpoint',
                n: records.length,
                levelIndex: 0,
                tick: event.tick,
                digest: event.digest,
                ...(options.includeHostTime && event.hostTime !== undefined
                    ? { hostTime: event.hostTime }
                    : {}),
            });
        }
        else if (event.kind === 'rejection') {
            records.push({
                kind: 'commit-mismatch',
                n: records.length,
                levelIndex: 0,
                tick: event.tick,
                participantId: event.participantId,
                submissionId: event.submissionId,
                commitmentId: event.commitmentId,
                scheme: event.scheme,
                ...(event.canonicalCommand === undefined
                    ? {}
                    : { canonicalCommand: event.canonicalCommand }),
                ...(event.cursor === undefined ? {} : { cursor: event.cursor }),
                ...(event.clientTime === undefined ? {} : { clientTime: event.clientTime }),
                ...(event.prevChainHash === undefined
                    ? {}
                    : { prevChainHash: event.prevChainHash }),
                ...(event.sig === undefined ? {} : { sig: event.sig }),
                ...(options.includeHostTime && event.hostTime !== undefined
                    ? { hostTime: event.hostTime }
                    : {}),
                ...(options.visibility && options.visibility !== 'full'
                    ? {}
                    : { attemptedReveal: structuredClone(event.attemptedReveal) }),
            });
        }
    }
    const replayActions = resolutions.flatMap((event) => event.inputs.map((input) => ({
        ...replayInput(input, options.perm),
        tick: event.tick,
    })));
    const extensions = {
        ...(options.extensions ?? {}),
        ...(transcript.header.dmath === undefined
            ? {}
            : { dmath: structuredClone(transcript.header.dmath) }),
    };
    return createReplayArtifact({
        sessionId: transcript.header.sessionId,
        game: transcript.header.game,
        seed: transcript.header.seed,
        seedPolicy: transcript.header.seedPolicy,
        perm: options.perm,
        levels: [{
                id: transcript.header.levelId,
                ...(transcript.header.levelVersion === undefined
                    ? {}
                    : { version: transcript.header.levelVersion }),
                ...(transcript.header.seedPolicy === 'explicit'
                    ? { seed: transcript.header.seed }
                    : {}),
                level: transcript.header.level,
                result: {
                    status: terminal.result.status,
                    stars: terminal.result.stars,
                    actionsUsed: terminal.result.actionsUsed,
                },
            }],
        actions: replayActions.map((action, n) => ({
            ...action,
            n,
            levelIndex: 0,
        })),
        records,
        ...(transcript.header.seatKeys === undefined
            ? {}
            : { seatKeys: structuredClone(transcript.header.seatKeys) }),
        ...(transcript.header.signaturePolicy === undefined
            ? {}
            : { signaturePolicy: structuredClone(transcript.header.signaturePolicy) }),
        ...(transcript.header.timeoutPolicy === undefined
            ? {}
            : { timeoutPolicy: structuredClone(transcript.header.timeoutPolicy) }),
        ...(options.visibility === undefined ? {} : { visibility: options.visibility }),
        ...(Object.keys(extensions).length === 0 ? {} : { extensions }),
    });
}
/**
 * Project an ordered, terminal sequence of one-level kernel transcripts into
 * one portable multi-level run. Per-level seeds must already equal the
 * derivation from `options.seed`.
 */
export function finalizeRunReplay(transcripts, options) {
    if (!Array.isArray(transcripts)) {
        throw new TypeError('transcripts must be an array');
    }
    if (!isObjectRecord(options)) {
        throw new TypeError('finalize options must be an object');
    }
    if (transcripts.length === 0) {
        throw new RangeError('a run replay requires at least one transcript');
    }
    for (const [levelIndex, transcript] of transcripts.entries()) {
        if (!isObjectRecord(transcript)) {
            throw new TypeError(`run transcript ${levelIndex} must be an object`);
        }
    }
    if (!Number.isSafeInteger(options.seed)
        || options.seed < 0
        || options.seed > 0xffff_ffff) {
        throw new RangeError('run seed must be an unsigned 32-bit integer');
    }
    const first = transcripts[0];
    const game = canonicalJson(first.header.game);
    const dmath = canonicalJson(first.header.dmath ?? null);
    const timeoutPolicy = canonicalJson(first.header.timeoutPolicy ?? null);
    const seatKeys = canonicalJson(first.header.seatKeys ?? null);
    const signaturePolicy = canonicalJson(first.header.signaturePolicy ?? null);
    const levels = [];
    const actions = [];
    const records = [];
    for (const [levelIndex, transcript] of transcripts.entries()) {
        if (transcript.header.sessionId !== first.header.sessionId) {
            throw new TypeError(`run transcript ${levelIndex} has a different sessionId`);
        }
        if (canonicalJson(transcript.header.game) !== game) {
            throw new TypeError(`run transcript ${levelIndex} has a different game`);
        }
        if (canonicalJson(transcript.header.dmath ?? null) !== dmath) {
            throw new TypeError(`run transcript ${levelIndex} has a different dmath declaration`);
        }
        if (canonicalJson(transcript.header.timeoutPolicy ?? null) !== timeoutPolicy) {
            throw new TypeError(`run transcript ${levelIndex} has a different timeout policy`);
        }
        if (canonicalJson(transcript.header.seatKeys ?? null) !== seatKeys
            || canonicalJson(transcript.header.signaturePolicy ?? null) !== signaturePolicy) {
            throw new TypeError(`run transcript ${levelIndex} has a different signature roster or policy`);
        }
        if (transcript.header.seedPolicy !== 'explicit') {
            throw new TypeError(`run transcript ${levelIndex} must record its derived level seed as explicit`);
        }
        const expectedSeed = runLevelSeed(options.seed, levelIndex);
        if (transcript.header.seed !== expectedSeed) {
            throw new TypeError(`run transcript ${levelIndex} seed must equal runLevelSeed(runSeed, ${levelIndex})`);
        }
        const segment = finalizeReplay(transcript, {
            perm: options.perm,
            ...(options.visibility === undefined ? {} : { visibility: options.visibility }),
            ...(options.includeHostTime === undefined
                ? {}
                : { includeHostTime: options.includeHostTime }),
        });
        const level = segment.header.levels[0];
        if (levelIndex < transcripts.length - 1
            && (options.advancePolicy ?? 'win-to-advance') === 'win-to-advance'
            && level.result.status !== 'won') {
            throw new TypeError(`run transcript ${levelIndex} must be won before another level`);
        }
        levels.push({
            id: level.id,
            ...(level.version === undefined ? {} : { version: level.version }),
            level: level.level,
            result: level.result,
        });
        for (const action of segment.actions) {
            const { kind: _kind, ...input } = action;
            actions.push({
                ...input,
                n: actions.length,
                levelIndex,
            });
        }
        for (const record of segment.records ?? []) {
            records.push({
                ...record,
                n: records.length,
                levelIndex,
            });
        }
    }
    const extensions = {
        ...(options.extensions ?? {}),
        ...(first.header.dmath === undefined
            ? {}
            : { dmath: structuredClone(first.header.dmath) }),
    };
    return createReplayArtifact({
        sessionId: first.header.sessionId,
        game: first.header.game,
        seed: options.seed,
        seedPolicy: GAOS_REPLAY_DERIVED_SEEDS,
        perm: options.perm,
        levels,
        actions,
        records,
        ...(first.header.seatKeys === undefined
            ? {}
            : { seatKeys: structuredClone(first.header.seatKeys) }),
        ...(first.header.signaturePolicy === undefined
            ? {}
            : { signaturePolicy: structuredClone(first.header.signaturePolicy) }),
        ...(first.header.timeoutPolicy === undefined
            ? {}
            : { timeoutPolicy: structuredClone(first.header.timeoutPolicy) }),
        ...(options.visibility === undefined ? {} : { visibility: options.visibility }),
        ...(Object.keys(extensions).length === 0 ? {} : { extensions }),
    });
}
