/**
 * TypeScript client for the GAOS-hosted Arena session API.
 * Stable wire-format types come from this package's protocol module; Arena observation
 * types remain the adapter layer in this package. Used by the renderer and
 * any Node-based agent harness — no game logic lives here, the server (or the
 * bundled engine, for local play) is authoritative.
 */
import { PROTOCOL_ID, PROTOCOL_VERSION, assertJsonObject, isParticipantId, } from './protocol.js';
export { PARTICIPANT_ID_PATTERN, PROTOCOL_ID, PROTOCOL_VERSION, assertJsonObject, assertJsonValue, canonicalJson, createParticipationIntentWindow, isParticipantId, makeTickId, resolveGameTick, tickEnvelope, } from './protocol.js';
export { RFC013_HOST_CONFORMANCE_SCENARIOS, RFC014_HOST_CONFORMANCE_SCENARIOS, RFC014_HOST_CONFORMANCE_FIXTURES, HOST_CONFORMANCE_VERSION, HOST_CONFORMANCE_FIXTURE_VERSION, presentationFrameFromObservation, runHostConformance, runReferenceHostConformance, } from './ecosystem.js';
export { SeatControlLedger, } from './seat-control.js';
export { aggregateBenchmarkScores, assertBenchmarkManifest, benchmarkManifestDigest, packBenchmarkRun, planBenchmarkEpisodes, runBenchmark, verifyBenchmarkBundle, } from './benchmark.js';
export { DYNAMIC_CONTROL_EVIDENCE_FORMAT, SUBMISSION_SIGNATURE_SCHEME_V2, controllerHandoffPreimageV2, externalAttestationPreimage, submissionChainHashV2, submissionEpochGenesisHashV2, periodicSignaturePreimageV2, submissionPreimageV2, verifyDynamicControlEvidenceV2, verifyExternalAttestation, } from './evidence.js';
export { PresentationClient, } from './presentation-client.js';
export { LeaderboardService, assertIndependentVerificationFacts, } from './leaderboard.js';
export { VERIFIER_KIT_EXTENSION, VERIFIER_KIT_MEDIA_TYPE, VERIFIER_KIT_SCHEMA, VERIFIER_REFERENCE_SCHEMA, admitVerifierKit, assertVerifierKitManifest, assertVerifierReference, extractVerifierKit, inspectVerifierKit, packVerifierKit, readCachedVerifierKit, resolveVerifierKit, runRestrictedVerifier, verifierReferenceFromExtensions, } from './verifier-kit.js';
export { ContainerVerifierRunner, containerVerifierInvocation, } from './container-verifier-runner.js';
/** Namespaced hosted-Arena concurrency extension. */
export const ARENA_CONTROL_EXTENSION = 'agilabs.arena';
/** Validate a persisted binding before restoring it into a client process. */
export function parseSessionBinding(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ProtocolMismatchError('session binding must be an object');
    }
    const binding = value;
    if (binding['protocol'] !== PROTOCOL_ID || binding['protocolVersion'] !== PROTOCOL_VERSION) {
        throw new ProtocolMismatchError(`session binding must use ${PROTOCOL_ID} ${PROTOCOL_VERSION}`);
    }
    if (typeof binding['sessionId'] !== 'string' || !binding['sessionId'].trim()
        || typeof binding['tickId'] !== 'string' || !binding['tickId'].trim()
        || !Number.isSafeInteger(binding['revision']) || binding['revision'] < 0
        || typeof binding['participantId'] !== 'string' || !isParticipantId(binding['participantId'])) {
        throw new ProtocolMismatchError('session binding cursor or participant is invalid');
    }
    if (Object.hasOwn(binding, 'controlRevision')
        && (!Number.isSafeInteger(binding['controlRevision']) || binding['controlRevision'] < 0)) {
        throw new ProtocolMismatchError('session binding controlRevision is invalid');
    }
    return {
        protocol: PROTOCOL_ID,
        protocolVersion: PROTOCOL_VERSION,
        sessionId: binding['sessionId'],
        tickId: binding['tickId'],
        revision: binding['revision'],
        participantId: binding['participantId'],
        ...(binding['controlRevision'] === undefined
            ? {} : { controlRevision: binding['controlRevision'] }),
    };
}
const ARENA_QUEUE_STATES = new Set([
    'waiting', 'matching', 'matched', 'completed', 'cancelled', 'expired',
]);
function arenaQueueTicketFrom(value, fallbackQueueId) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const ticket = value;
    const queueId = typeof ticket['queueId'] === 'string' ? ticket['queueId'] : fallbackQueueId;
    const state = ticket['state'];
    const matchId = ticket['matchId'];
    const participantId = ticket['participantId'];
    if (typeof queueId !== 'string' || !queueId
        || typeof ticket['ticketId'] !== 'string' || !ticket['ticketId']
        || typeof state !== 'string' || !ARENA_QUEUE_STATES.has(state)
        || typeof ticket['joinedAt'] !== 'number' || !Number.isFinite(ticket['joinedAt'])
        || typeof ticket['expiresAt'] !== 'number' || !Number.isFinite(ticket['expiresAt'])
        || typeof ticket['mapId'] !== 'string' || !ticket['mapId']
        || typeof ticket['teamId'] !== 'string' || !ticket['teamId']
        || (matchId !== null && typeof matchId !== 'string')
        || (participantId !== null
            && (typeof participantId !== 'string' || !isParticipantId(participantId))))
        return undefined;
    return { ...ticket, queueId };
}
export class ProtocolMismatchError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProtocolMismatchError';
    }
}
/** Runtime guard shared by clients that consume opaque game observations. */
export function parseTickResult(data) {
    if (!data || typeof data !== 'object')
        throw new ProtocolMismatchError('response is not an object');
    const value = data;
    if (value['protocol'] !== PROTOCOL_ID || value['protocolVersion'] !== PROTOCOL_VERSION) {
        throw new ProtocolMismatchError(`expected ${PROTOCOL_ID} ${PROTOCOL_VERSION}`);
    }
    if (value['kind'] !== 'tick' && value['kind'] !== 'pending') {
        throw new ProtocolMismatchError('response kind must be tick or pending');
    }
    if (typeof value['sessionId'] !== 'string'
        || !value['sessionId'].trim()
        || typeof value['tickId'] !== 'string'
        || !value['tickId'].trim()) {
        throw new ProtocolMismatchError('response sessionId/tickId missing');
    }
    if (Object.hasOwn(value, 'extensions')) {
        try {
            assertJsonObject(value['extensions'], 'response extensions');
        }
        catch (error) {
            throw new ProtocolMismatchError(error instanceof Error ? error.message : 'response extensions invalid');
        }
    }
    if (!Number.isSafeInteger(value['revision'])
        || value['revision'] < 0
        || !Object.hasOwn(value, 'tick')) {
        throw new ProtocolMismatchError('response revision/tick missing');
    }
    if (value['kind'] === 'pending') {
        if (!isParticipantList(value['submittedParticipants'])
            || !isParticipantList(value['awaitingParticipants'])) {
            throw new ProtocolMismatchError('pending participant lists missing');
        }
        const submitted = value['submittedParticipants'];
        const awaiting = value['awaitingParticipants'];
        if (awaiting.length === 0) {
            throw new ProtocolMismatchError('pending envelope must await a participant');
        }
        if (new Set(submitted).size !== submitted.length || new Set(awaiting).size !== awaiting.length) {
            throw new ProtocolMismatchError('pending participant lists must be unique');
        }
        if (submitted.some((participantId) => awaiting.includes(participantId))) {
            throw new ProtocolMismatchError('pending participant lists must be disjoint');
        }
        const accepted = value['acceptedParticipantId'];
        if (Object.hasOwn(value, 'acceptedParticipantId')
            && (typeof accepted !== 'string' || !isParticipantId(accepted) || !submitted.includes(accepted))) {
            throw new ProtocolMismatchError('pending acceptedParticipantId must be submitted');
        }
    }
    return value;
}
function isParticipantList(value) {
    return Array.isArray(value)
        && value.every((participantId) => (isParticipantId(participantId)));
}
export class ArenaApiError extends Error {
    status;
    error;
    code;
    details;
    responseBody;
    /** Structured active-ticket recovery data returned by matchmaking 409s. */
    ticket;
    constructor(status, error, code, details, responseBody) {
        super(`HTTP ${status}: ${error}`);
        this.status = status;
        this.error = error;
        this.code = code;
        this.details = details;
        this.responseBody = responseBody;
        this.name = 'ArenaApiError';
        this.ticket = arenaQueueTicketFrom(details?.['ticket'], details?.['queueId']);
    }
}
/** 422 — the action was not in the legal set for this tick. */
export class IllegalActionRejected extends ArenaApiError {
    constructor(status, error, code, details, responseBody) {
        super(status, error, code, details, responseBody);
        this.name = 'IllegalActionRejected';
    }
}
function awaitWithSignal(promise, signal) {
    if (!signal)
        return promise;
    if (signal.aborted)
        return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}
class ResponseTooLargeError extends Error {
}
async function readResponseText(response, maxBytes) {
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
            await reader.cancel();
            throw new ResponseTooLargeError(`HTTP response exceeds ${maxBytes} bytes`);
        }
        text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
}
const ARENA_ROOM_STATUSES = new Set([
    'connecting', 'active', 'completed', 'expired',
]);
const ARENA_OUTCOME_REASONS = new Set([
    'game', 'disconnect', 'idle', 'abandoned',
]);
function nullableFiniteNumber(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value));
}
function validateArenaOutcome(value, participantIds) {
    if (value === null)
        return true;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const outcome = value;
    return (outcome['winner'] === null
        || (isParticipantId(outcome['winner']) && participantIds.has(outcome['winner'])))
        && (outcome['loser'] === null
            || (isParticipantId(outcome['loser']) && participantIds.has(outcome['loser'])))
        && typeof outcome['reason'] === 'string'
        && ARENA_OUTCOME_REASONS.has(outcome['reason'])
        && (!Object.hasOwn(outcome, 'gameReason') || typeof outcome['gameReason'] === 'string');
}
export class ArenaClient {
    baseUrl;
    apiKey;
    options;
    bindings = new Map();
    observedArenaCursors = new Map();
    request;
    constructor(baseUrl = 'http://localhost:8899', apiKey, options = {}) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.options = options;
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.request = options.fetch ?? fetch;
        if (options.timeoutMs !== undefined
            && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0)) {
            throw new RangeError('timeoutMs must be a non-negative safe integer');
        }
        if (options.maxResponseBytes !== undefined
            && (!Number.isSafeInteger(options.maxResponseBytes) || options.maxResponseBytes < 1)) {
            throw new RangeError('maxResponseBytes must be a positive safe integer');
        }
    }
    remember(result, participantId) {
        const previous = this.bindings.get(result.sessionId);
        const observation = result.tick;
        const controlRevision = Number.isSafeInteger(observation?.controlRevision)
            && observation.controlRevision >= 0
            ? observation.controlRevision
            : undefined;
        const binding = {
            protocol: PROTOCOL_ID,
            protocolVersion: PROTOCOL_VERSION,
            sessionId: result.sessionId,
            tickId: result.tickId,
            revision: result.revision,
            participantId: participantId ?? previous?.participantId ?? 'player',
            ...(controlRevision !== undefined ? { controlRevision } : {}),
        };
        this.bindings.set(result.sessionId, binding);
        this.observedArenaCursors.delete(result.sessionId);
        return binding;
    }
    /** Return a JSON-safe snapshot for persistence across process restarts. */
    getSessionBinding(sessionId) {
        const binding = this.bindings.get(sessionId);
        return binding ? { ...binding } : undefined;
    }
    /** Restore a previously persisted cursor/seat binding for exact retries. */
    restoreSessionBinding(value) {
        const binding = parseSessionBinding(value);
        this.bindings.set(binding.sessionId, binding);
        this.observedArenaCursors.delete(binding.sessionId);
        return { ...binding };
    }
    parse(data, expectedSessionId) {
        const result = parseTickResult(data);
        if (expectedSessionId && result.sessionId !== expectedSessionId) {
            throw new ProtocolMismatchError('response session does not match request');
        }
        return result;
    }
    parseArenaRoom(data, expectedSessionId) {
        if (!data || typeof data !== 'object')
            throw new ProtocolMismatchError('Arena room is not an object');
        const value = data;
        if (value['sessionId'] !== expectedSessionId || value['matchId'] !== expectedSessionId) {
            throw new ProtocolMismatchError('Arena room does not match request');
        }
        if (typeof value['participantId'] !== 'string' || !isParticipantId(value['participantId'])) {
            throw new ProtocolMismatchError('Arena room participant missing');
        }
        const participants = value['participants'];
        const participantIds = new Set(Array.isArray(participants)
            ? participants.map((entry) => entry?.['participantId'])
                .filter((id) => typeof id === 'string')
            : []);
        if (typeof value['status'] !== 'string'
            || !ARENA_ROOM_STATUSES.has(value['status'])
            || typeof value['readyDeadline'] !== 'number' || !Number.isFinite(value['readyDeadline'])
            || !nullableFiniteNumber(value['tickDeadline'])
            || !nullableFiniteNumber(value['expiresAt'])
            || !Array.isArray(participants)
            || !participants.every((entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                    return false;
                const participant = entry;
                return isParticipantId(participant['participantId'])
                    && typeof participant['claimed'] === 'boolean'
                    && typeof participant['connected'] === 'boolean'
                    && nullableFiniteNumber(participant['reconnectDeadline']);
            })
            || new Set(participants.map((entry) => entry['participantId'])).size
                !== participants.length
            || !participantIds.has(value['participantId'])
            || !validateArenaOutcome(value['outcome'], participantIds)) {
            throw new ProtocolMismatchError('Arena room fields are invalid');
        }
        const tick = this.parse(value['tick'], expectedSessionId);
        this.remember(tick, value['participantId']);
        return { ...value, tick };
    }
    async call(method, path, body, callOptions = {}) {
        const timeoutMs = this.options.timeoutMs ?? 30_000;
        const timeout = timeoutMs > 0
            ? AbortSignal.timeout(timeoutMs)
            : undefined;
        const signals = [this.options.signal, callOptions.signal, timeout]
            .filter((signal) => signal !== undefined);
        const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
        const key = typeof this.apiKey === 'function'
            ? await awaitWithSignal(Promise.resolve().then(() => this.apiKey()), signal)
            : this.apiKey;
        const res = await this.request(this.baseUrl + path, {
            method,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
            headers: {
                'content-type': 'application/json',
                ...(key ? { authorization: `Bearer ${key}` } : {}),
            },
        });
        const maxResponseBytes = this.options.maxResponseBytes ?? 1024 * 1024;
        let responseBody;
        try {
            responseBody = await readResponseText(res, maxResponseBytes);
        }
        catch (error) {
            if (!(error instanceof ResponseTooLargeError))
                throw error;
            if (res.ok)
                throw new ProtocolMismatchError(error.message);
            if (res.status === 422) {
                throw new IllegalActionRejected(res.status, error.message);
            }
            throw new ArenaApiError(res.status, error.message);
        }
        let data;
        try {
            data = responseBody ? JSON.parse(responseBody) : undefined;
        }
        catch {
            data = undefined;
        }
        if (!res.ok) {
            const message = data?.error ?? (responseBody.trim() || res.statusText);
            const code = typeof data?.code === 'string' ? data.code : undefined;
            const details = data && typeof data === 'object'
                ? data
                : undefined;
            if (res.status === 422)
                throw new IllegalActionRejected(res.status, message, code, details, responseBody);
            throw new ArenaApiError(res.status, message, code, details, responseBody);
        }
        if (data === undefined)
            throw new ProtocolMismatchError(`HTTP ${res.status} response is not JSON`);
        return data;
    }
    async createSession(req, participantId = 'player', callOptions = {}) {
        const result = this.parse(await this.call('POST', '/v1/sessions', req, callOptions));
        if (result.kind !== 'tick')
            throw new ProtocolMismatchError('new session must start resolved');
        const binding = this.remember(result, participantId);
        return { sessionId: result.sessionId, tick: result.tick, binding };
    }
    async getTickEnvelope(sessionId, callOptions = {}) {
        const result = this.parse(await this.call('GET', `/v1/sessions/${encodeURIComponent(sessionId)}/tick`, undefined, callOptions), sessionId);
        this.remember(result);
        return result;
    }
    /** Compatibility view: returns the latest resolved observation while pending. */
    async getTick(sessionId, callOptions = {}) {
        return (await this.getTickEnvelope(sessionId, callOptions)).tick;
    }
    /** Stable primitive for any JSON command and any game observation shape. */
    async submitIntent(sessionId, command, opts = {}) {
        return this.submitIntentTo(`/v1/sessions/${encodeURIComponent(sessionId)}/actions`, sessionId, command, opts);
    }
    async submitIntentTo(path, sessionId, command, opts) {
        let binding = this.bindings.get(sessionId);
        if (!binding && !opts.cursor) {
            if (opts.submissionId !== undefined) {
                throw new ProtocolMismatchError('explicit submissionId requires the original cursor or a restored session binding');
            }
            await this.getTickEnvelope(sessionId, { signal: opts.signal });
            binding = this.bindings.get(sessionId);
        }
        const cursor = opts.cursor ?? binding;
        if (!cursor)
            throw new ProtocolMismatchError('session cursor unavailable');
        const participantId = opts.participantId ?? binding?.participantId ?? 'player';
        const submission = {
            protocol: PROTOCOL_ID,
            protocolVersion: PROTOCOL_VERSION,
            sessionId,
            tickId: cursor.tickId,
            revision: cursor.revision,
            participantId,
            // Stable across an application retry after an ambiguous network error.
            submissionId: opts.submissionId ?? `${participantId}:${cursor.tickId}`,
            command,
            ...(opts.controlRevision !== undefined
                ? { extensions: {
                        [ARENA_CONTROL_EXTENSION]: { controlRevision: opts.controlRevision },
                    } }
                : {}),
        };
        const result = this.parse(await this.call('POST', path, submission, { signal: opts.signal }), sessionId);
        this.remember(result, participantId);
        return result;
    }
    // ------------------------------------------------ hosted Arena mode
    arenaCatalog(callOptions = {}) {
        return this.call('GET', '/v1/arena/maps', undefined, callOptions);
    }
    /** Join the authenticated live queue. Reuse requestId after network ambiguity. */
    joinArenaQueue(req, callOptions = {}) {
        return this.call('POST', '/v1/arena/matchmaking', {
            ...req,
            requestId: req.requestId ?? crypto.randomUUID(),
        }, callOptions);
    }
    arenaQueueTicket(queueId, ticketId, callOptions = {}) {
        return this.call('GET', `/v1/arena/matchmaking/${encodeURIComponent(queueId)}/${encodeURIComponent(ticketId)}`, undefined, callOptions);
    }
    cancelArenaQueueTicket(queueId, ticketId, callOptions = {}) {
        return this.call('DELETE', `/v1/arena/matchmaking/${encodeURIComponent(queueId)}/${encodeURIComponent(ticketId)}`, undefined, callOptions);
    }
    /** Read-only room recovery snapshot; it does not claim or heartbeat a seat. */
    async getArenaRoom(matchId, callOptions = {}) {
        return this.parseArenaRoom(await this.call('GET', `/v1/arena/matches/${encodeURIComponent(matchId)}`, undefined, callOptions), matchId);
    }
    async setArenaPresence(matchId, connected, callOptions = {}) {
        return this.parseArenaRoom(await this.call('POST', `/v1/arena/matches/${encodeURIComponent(matchId)}/presence`, { connected }, callOptions), matchId);
    }
    heartbeatArenaMatch(matchId, callOptions = {}) {
        return this.setArenaPresence(matchId, true, callOptions);
    }
    /** Required after matching. The second claimed seat atomically starts tick timers. */
    connectArenaMatch(matchId, callOptions = {}) {
        return this.setArenaPresence(matchId, true, callOptions);
    }
    disconnectArenaMatch(matchId, callOptions = {}) {
        return this.setArenaPresence(matchId, false, callOptions);
    }
    async getArenaTickEnvelope(matchId, callOptions = {}) {
        const result = this.parse(await this.call('GET', `/v1/arena/matches/${encodeURIComponent(matchId)}/tick`, undefined, callOptions), matchId);
        const binding = this.bindings.get(matchId);
        // Tick envelopes intentionally omit authenticated seat identity. Avoid
        // inventing the ordinary solo `player` seat when callers poll first;
        // submitArenaIntent will recover the real room binding on demand.
        if (binding)
            this.remember(result, binding.participantId);
        else {
            const observation = result.tick;
            const controlRevision = Number.isSafeInteger(observation?.controlRevision)
                && observation.controlRevision >= 0
                ? observation.controlRevision
                : undefined;
            this.observedArenaCursors.set(matchId, {
                tickId: result.tickId,
                revision: result.revision,
                ...(controlRevision === undefined ? {} : { controlRevision }),
            });
        }
        return result;
    }
    async submitArenaIntent(matchId, command, opts = {}) {
        let binding = this.bindings.get(matchId);
        const observedCursor = opts.submissionId !== undefined
            ? this.observedArenaCursors.get(matchId)
            : undefined;
        const originalCursor = opts.cursor
            ?? observedCursor;
        if (!binding) {
            if (opts.submissionId !== undefined && !originalCursor) {
                throw new ProtocolMismatchError('explicit submissionId requires the original cursor or a restored Arena session binding');
            }
            await this.getArenaRoom(matchId, { signal: opts.signal });
            binding = this.bindings.get(matchId);
        }
        const cursor = originalCursor ?? binding;
        if (!cursor)
            throw new ProtocolMismatchError('Arena session cursor unavailable');
        const controlRevision = opts.controlRevision ?? opts.cursor?.controlRevision
            ?? (opts.cursor ? undefined : observedCursor?.controlRevision ?? binding?.controlRevision);
        if (!Number.isSafeInteger(controlRevision) || controlRevision < 0) {
            throw new ProtocolMismatchError('Arena controlRevision unavailable');
        }
        const participantId = binding?.participantId ?? 'player';
        return this.submitIntentTo(`/v1/arena/matches/${encodeURIComponent(matchId)}/actions`, matchId, command, {
            ...opts,
            cursor,
            controlRevision,
            participantId,
            submissionId: opts.submissionId
                ?? `${participantId}:${cursor.tickId}:control:${controlRevision}`,
        });
    }
    /**
     * Arena convenience wrapper. Solo ticks resolve in one request; if a
     * future multiplayer Arena adapter returns pending, poll for a bounded time.
     * Generic games should call `submitIntent` and handle the discriminated union.
     */
    async submitAction(sessionId, action, opts = {}) {
        const result = await this.submitIntent(sessionId, action, opts);
        if (result.kind === 'tick')
            return result.tick;
        const interval = opts.pollIntervalMs ?? 250;
        const attempts = opts.maxPollAttempts ?? 120;
        for (let attempt = 0; attempt < attempts; attempt++) {
            await awaitWithSignal(new Promise((resolve) => setTimeout(resolve, interval)), opts.signal);
            const polled = await this.getTickEnvelope(sessionId, { signal: opts.signal });
            if (polled.kind === 'tick' && polled.revision > result.revision)
                return polled.tick;
        }
        throw new ArenaApiError(408, `timed out waiting for tick after ${attempts} polls`);
    }
    submitSession(sessionId, opts, callOptions = {}) {
        return this.call('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/submit`, opts ?? {}, callOptions);
    }
    labLevelVersions(callOptions = {}) {
        return this.call('GET', '/levels/lab/versions', undefined, callOptions);
    }
    /** Self-report an unpaid Challenge claim (authenticated, stored unverified). */
    reportUnpaidChallenge(claim, callOptions = {}) {
        return this.call('POST', '/leaderboards/challenge/unpaid', claim, callOptions);
    }
    challengeBoards(gameId, callOptions = {}) {
        return this.call('GET', `/leaderboards/challenge/${encodeURIComponent(gameId)}`, undefined, callOptions);
    }
    // ------------------------------------------------ agent API keys (JWT only)
    /** The caller's agent keys — metadata only, never hashes or plaintexts. */
    listKeys(callOptions = {}) {
        return this.call('GET', '/keys', undefined, callOptions);
    }
    /** Mint an agent key. The plaintext `key` is returned exactly ONCE. */
    createKey(label, callOptions = {}) {
        return this.call('POST', '/keys', label === undefined ? {} : { label }, callOptions);
    }
    /** Revoke an agent key by id (owners only; admins can revoke any). */
    revokeKey(id, callOptions = {}) {
        return this.call('POST', `/keys/${encodeURIComponent(id)}/revoke`, undefined, callOptions);
    }
}
