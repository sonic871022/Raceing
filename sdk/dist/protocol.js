/**
 * Stable wire contracts for deterministic tick-based games.
 *
 * Observations and commands are deliberately opaque generic values. A grid
 * game may put a text board in an observation; a card game may put hands and
 * piles there. Values crossing the wire must be JSON-serializable.
 */
export const PROTOCOL_ID = 'agilabs.ticks';
export const PROTOCOL_VERSION = '1.0';
/** Portable seat ids keep canonical ordering identical across SDK languages. */
export const PARTICIPANT_ID_PATTERN = '^[A-Za-z0-9_.:@-]{1,128}$';
const INVALID_PARTICIPANT_ID_CHAR = /[^A-Za-z0-9_.:@-]/;
export function isParticipantId(value) {
    return typeof value === 'string'
        && value.length >= 1
        && value.length <= 128
        && !INVALID_PARTICIPANT_ID_CHAR.test(value);
}
/** Resolve one canonical simulation tick through either adapter generation. */
export function resolveGameTick(definition, state, intents) {
    return definition.resolveTick(state, intents);
}
/** Instance-local registry: hosts opt games in explicitly without global state. */
export class GameRegistry {
    definitions = new Map();
    register(definition) {
        if (typeof definition.id !== 'string'
            || !definition.id.trim()
            || typeof definition.version !== 'string'
            || !definition.version.trim()) {
            throw new Error('game id and version are required');
        }
        let versions = this.definitions.get(definition.id);
        if (!versions) {
            versions = new Map();
            this.definitions.set(definition.id, versions);
        }
        if (versions.has(definition.version)) {
            throw new Error(`game already registered: ${definition.id}@${definition.version}`);
        }
        versions.set(definition.version, definition);
    }
    get(id, version) {
        return this.definitions.get(id)?.get(version);
    }
}
/**
 * Map one engine collection tick to the protocol's eligible participant set.
 * Sequential play creates a one-seat window; simultaneous play includes every
 * declared seat. Portable seat-id validation is delegated to the normal
 * intent-window constructor.
 */
export function createParticipationIntentWindow(sessionId, revision, participation) {
    if (!participation || typeof participation !== 'object') {
        throw new TypeError('participation descriptor must be an object');
    }
    if (participation.mode === 'sequential') {
        return createIntentWindow(sessionId, revision, [participation.activeSeat]);
    }
    if (participation.mode === 'simultaneous') {
        return createIntentWindow(sessionId, revision, participation.seats);
    }
    throw new TypeError('participation mode must be sequential or simultaneous');
}
function hasIntent(window, participantId) {
    return Object.prototype.hasOwnProperty.call(window.intents, participantId);
}
export class IntentCollectionError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message, { cause });
        this.code = code;
        this.cause = cause;
        this.name = 'IntentCollectionError';
    }
}
export function makeTickId(sessionId, revision) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('sessionId must be a non-empty string');
    }
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error('revision must be a non-negative safe integer');
    }
    return `${sessionId}:${revision}`;
}
export function createIntentWindow(sessionId, revision, participantIds) {
    makeTickId(sessionId, revision);
    if (!Array.isArray(participantIds) || participantIds.some((id) => !isParticipantId(id))) {
        throw new Error('participant ids must match the portable ASCII seat-id pattern');
    }
    const participants = [...new Set(participantIds)].sort();
    if (participants.length === 0)
        throw new Error('at least one participant is required');
    if (participants.length !== participantIds.length) {
        throw new Error('participant ids must be non-empty and unique');
    }
    return {
        sessionId,
        tickId: makeTickId(sessionId, revision),
        revision,
        participants,
        intents: {},
    };
}
/**
 * Add one intent without mutating the persisted input window. Exact retries
 * are idempotent; stale or conflicting submissions are explicit errors. A
 * ready result may be recomputed for an exact retry. The host must atomically
 * commit resolution, its retry receipt, and the next intent window to ensure
 * the reducer itself runs once.
 */
export function collectIntent(window, submission) {
    validateIntentSubmission(window, submission);
    const existing = hasIntent(window, submission.participantId)
        ? window.intents[submission.participantId]
        : undefined;
    if (existing) {
        let exactRetry = false;
        try {
            exactRetry = existing.submissionId === submission.submissionId
                && stableJson(existing.command) === stableJson(submission.command);
        }
        catch (error) {
            throw new IntentCollectionError('invalid_submission', error instanceof Error ? error.message : 'stored intent must contain plain JSON');
        }
        if (exactRetry) {
            const submittedParticipants = window.participants.filter((id) => hasIntent(window, id));
            const awaitingParticipants = window.participants.filter((id) => !hasIntent(window, id));
            if (awaitingParticipants.length > 0) {
                return { status: 'pending', window, submittedParticipants, awaitingParticipants };
            }
            return {
                status: 'ready',
                window,
                intents: window.participants.map((id) => window.intents[id]),
            };
        }
        throw new IntentCollectionError('conflicting_intent', `participant ${submission.participantId} submitted a different intent for ${window.tickId}`);
    }
    const intent = {
        participantId: submission.participantId,
        submissionId: submission.submissionId,
        command: submission.command,
        ...(submission.clientTime === undefined ? {} : { clientTime: submission.clientTime }),
        ...(submission.prevChainHash === undefined
            ? {}
            : { prevChainHash: submission.prevChainHash }),
        ...(submission.sig === undefined ? {} : { sig: submission.sig }),
    };
    const next = {
        ...window,
        participants: [...window.participants],
        intents: { ...window.intents, [submission.participantId]: intent },
    };
    const submittedParticipants = next.participants.filter((id) => hasIntent(next, id));
    const awaitingParticipants = next.participants.filter((id) => !hasIntent(next, id));
    if (awaitingParticipants.length > 0) {
        return { status: 'pending', window: next, submittedParticipants, awaitingParticipants };
    }
    return {
        status: 'ready',
        window: next,
        intents: next.participants.map((id) => next.intents[id]),
    };
}
/** Validate the stable wire cursor before interpreting a game-owned command. */
export function validateIntentSubmission(window, submission) {
    if (submission.protocol !== PROTOCOL_ID || submission.protocolVersion !== PROTOCOL_VERSION) {
        throw new IntentCollectionError('invalid_protocol', `expected ${PROTOCOL_ID} ${PROTOCOL_VERSION}`);
    }
    if (submission.sessionId !== window.sessionId) {
        throw new IntentCollectionError('wrong_session', 'submission session does not match endpoint');
    }
    if (submission.tickId !== window.tickId || submission.revision !== window.revision) {
        throw new IntentCollectionError('stale_tick', `expected tick ${window.tickId} revision ${window.revision}`);
    }
    if (!window.participants.includes(submission.participantId)) {
        throw new IntentCollectionError('unknown_participant', `unknown participant ${submission.participantId}`);
    }
    if (typeof submission.submissionId !== 'string' || !submission.submissionId.trim()) {
        throw new IntentCollectionError('invalid_submission', 'submissionId is required');
    }
    try {
        assertJsonValue(submission.command, 'command');
        if (submission.extensions !== undefined)
            assertJsonObject(submission.extensions, 'extensions');
    }
    catch (error) {
        throw new IntentCollectionError('invalid_submission', error instanceof Error ? error.message : 'submission must contain plain JSON');
    }
}
function assertWellFormedUnicode(value, label) {
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
                throw new TypeError(`${label} must not contain unpaired surrogates`);
            }
            index++;
        }
        else if (unit >= 0xdc00 && unit <= 0xdfff) {
            throw new TypeError(`${label} must not contain unpaired surrogates`);
        }
    }
}
/** Reject values whose JSON serialization is lossy, ambiguous, or unsafe. */
export function assertJsonValue(value, label = 'value') {
    const active = new WeakSet();
    const visit = (candidate, path) => {
        if (candidate === null || typeof candidate === 'boolean')
            return;
        if (typeof candidate === 'string') {
            assertWellFormedUnicode(candidate, path);
            return;
        }
        if (typeof candidate === 'number') {
            if (!Number.isFinite(candidate))
                throw new TypeError(`${path} must contain only finite numbers`);
            if (Number.isInteger(candidate) && !Number.isSafeInteger(candidate)) {
                throw new TypeError(`${path} integer numbers must be within the JavaScript safe range`);
            }
            return;
        }
        if (typeof candidate !== 'object')
            throw new TypeError(`${path} must contain only plain JSON values`);
        if (active.has(candidate))
            throw new TypeError(`${path} must not contain cycles`);
        active.add(candidate);
        try {
            if (Array.isArray(candidate)) {
                if (Object.getOwnPropertySymbols(candidate).length > 0) {
                    throw new TypeError(`${path} must not contain symbol keys`);
                }
                for (let index = 0; index < candidate.length; index++) {
                    if (!Object.hasOwn(candidate, index))
                        throw new TypeError(`${path} must not contain sparse arrays`);
                    visit(candidate[index], `${path}[${index}]`);
                }
                const names = Object.getOwnPropertyNames(candidate);
                if (names.some((key) => key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key)
                    || Number(key) >= candidate.length))) {
                    throw new TypeError(`${path} arrays must not contain named properties`);
                }
            }
            else {
                const prototype = Object.getPrototypeOf(candidate);
                if (prototype !== Object.prototype && prototype !== null) {
                    throw new TypeError(`${path} must contain only plain objects`);
                }
                if (Object.getOwnPropertySymbols(candidate).length > 0) {
                    throw new TypeError(`${path} must not contain symbol keys`);
                }
                for (const key of Object.keys(candidate)) {
                    assertWellFormedUnicode(key, `${path} object key`);
                    const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
                    if (!Object.hasOwn(descriptor, 'value')) {
                        throw new TypeError(`${path} must contain only data properties`);
                    }
                    visit(candidate[key], `${path}.${key}`);
                }
                if (Object.getOwnPropertyNames(candidate).length !== Object.keys(candidate).length) {
                    throw new TypeError(`${path} must not contain hidden properties`);
                }
            }
        }
        finally {
            active.delete(candidate);
        }
    };
    visit(value, label);
}
export function assertJsonObject(value, label = 'value') {
    assertJsonValue(value, label);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be a plain JSON object`);
    }
}
/** Compare strings lexicographically by Unicode scalar value, not UTF-16 units. */
function compareUnicodeCodePoints(left, right) {
    const leftPoints = [...left];
    const rightPoints = [...right];
    const length = Math.min(leftPoints.length, rightPoints.length);
    for (let index = 0; index < length; index++) {
        const difference = leftPoints[index].codePointAt(0)
            - rightPoints[index].codePointAt(0);
        if (difference !== 0)
            return difference;
    }
    return leftPoints.length - rightPoints.length;
}
/** Collision-free canonical JSON used for exact retry comparison. */
export function canonicalJson(value) {
    assertJsonValue(value);
    const encode = (candidate) => {
        if (Array.isArray(candidate))
            return `[${candidate.map(encode).join(',')}]`;
        if (candidate !== null && typeof candidate === 'object') {
            return `{${Object.keys(candidate).sort(compareUnicodeCodePoints).map((key) => (`${JSON.stringify(key)}:${encode(candidate[key])}`)).join(',')}}`;
        }
        return JSON.stringify(candidate);
    };
    return encode(value);
}
function stableJson(value) {
    return canonicalJson(value);
}
export function tickEnvelope(sessionId, revision, tick, extensions) {
    if (extensions !== undefined)
        assertJsonObject(extensions, 'extensions');
    return {
        protocol: PROTOCOL_ID,
        protocolVersion: PROTOCOL_VERSION,
        kind: 'tick',
        sessionId,
        tickId: makeTickId(sessionId, revision),
        revision,
        tick,
        ...(extensions ? { extensions } : {}),
    };
}
export function pendingEnvelope(window, tick, acceptedParticipantId, extensions) {
    if (extensions !== undefined)
        assertJsonObject(extensions, 'extensions');
    const submittedParticipants = window.participants.filter((id) => hasIntent(window, id));
    return {
        protocol: PROTOCOL_ID,
        protocolVersion: PROTOCOL_VERSION,
        kind: 'pending',
        sessionId: window.sessionId,
        tickId: window.tickId,
        revision: window.revision,
        tick,
        ...(acceptedParticipantId ? { acceptedParticipantId } : {}),
        submittedParticipants,
        awaitingParticipants: window.participants.filter((id) => !hasIntent(window, id)),
        ...(extensions ? { extensions } : {}),
    };
}
