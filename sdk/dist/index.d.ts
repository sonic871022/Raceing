/**
 * TypeScript client for the GAOS-hosted Arena session API.
 * Stable wire-format types come from this package's protocol module; Arena observation
 * types remain the adapter layer in this package. Used by the renderer and
 * any Node-based agent harness — no game logic lives here, the server (or the
 * bundled engine, for local play) is authoritative.
 */
import { PROTOCOL_ID, PROTOCOL_VERSION, type ProtocolExtensions, type TickCursor, type TickResult } from './protocol.js';
export { PARTICIPANT_ID_PATTERN, PROTOCOL_ID, PROTOCOL_VERSION, assertJsonObject, assertJsonValue, canonicalJson, createParticipationIntentWindow, isParticipantId, makeTickId, resolveGameTick, tickEnvelope, type CommandSubmission, type GameDefinition, type JsonObject, type JsonPrimitive, type JsonValue, type IntentParticipation, type PendingEnvelope, type ProtocolExtensions, type TickCursor, type TickEnvelope, type TickResult, } from './protocol.js';
export { RFC013_HOST_CONFORMANCE_SCENARIOS, RFC014_HOST_CONFORMANCE_SCENARIOS, RFC014_HOST_CONFORMANCE_FIXTURES, HOST_CONFORMANCE_VERSION, HOST_CONFORMANCE_FIXTURE_VERSION, presentationFrameFromObservation, runHostConformance, runReferenceHostConformance, type HostedSession, type HostArtifact, type HostCreateInput, type HostObservation, type HostSeatControl, type HostSubmission, type PresentationEvent, type PresentationFrame, type Rfc013HostConformanceScenario, type SessionHostDriver, type HostConformanceAdapter, type HostConformanceReport, type HostConformanceFixture, } from './ecosystem.js';
export { SeatControlLedger, type PreparedSeatControl, type SeatControlAuthorization, type SeatControlChange, type SeatControlCheckpoint, type SeatControlEpoch, type SeatController, type SeatControllerKind, } from './seat-control.js';
export { aggregateBenchmarkScores, assertBenchmarkManifest, benchmarkManifestDigest, packBenchmarkRun, planBenchmarkEpisodes, runBenchmark, verifyBenchmarkBundle, type BenchmarkAggregate, type BenchmarkAgentAdapter, type BenchmarkAgentKind, type BenchmarkAuthorityRequirement, type BenchmarkBundle, type BenchmarkBundleEpisode, type BenchmarkBundleVerification, type BenchmarkEpisodePlan, type BenchmarkEpisodeResult, type BenchmarkIdentity, type BenchmarkManifest, type BenchmarkScoring, type BenchmarkSubmissionPolicy, type BenchmarkRun, type BenchmarkRunCheckpoint, type BenchmarkTask, type BenchmarkTaskScore, type EvidenceTrustClaims, type LeaderboardEntry, type LeaderboardEntryV2, type SubmissionVerificationFacts, type VerificationState, } from './benchmark.js';
export { DYNAMIC_CONTROL_EVIDENCE_FORMAT, SUBMISSION_SIGNATURE_SCHEME_V2, controllerHandoffPreimageV2, externalAttestationPreimage, submissionChainHashV2, submissionEpochGenesisHashV2, periodicSignaturePreimageV2, submissionPreimageV2, verifyDynamicControlEvidenceV2, verifyExternalAttestation, type ControllerEpochGenesisV2, type ControllerHandoffV2, type DynamicControlEvidenceV2, type DynamicControlCheckpointV2, type DynamicControlEpochSignatureStateV2, type DynamicControlPeriodicEnvelopeV2, type DynamicControlPeriodicSignatureV2, type DynamicControlSignedCommand, type DynamicControlVerification, type EpochVerificationFact, type ExternalAttestation, type ExternalKeyRef, type ExternalPublicKey, type ExternalSigner, type ExternalTrustPolicy, type ExternalTrustPurpose, type ExternalTrustResolver, type ExternalTrustResult, type SubmissionSigningEnvelopeV2, } from './evidence.js';
export { PresentationClient, type PresentationClientMessage, type PresentationClientReducer, type PresentationClientState, } from './presentation-client.js';
export { LeaderboardService, assertIndependentVerificationFacts, type LeaderboardObjectStore, type LeaderboardQuery, type LeaderboardSubmissionMetadata, type LeaderboardVerifierQueue, } from './leaderboard.js';
export { VERIFIER_KIT_EXTENSION, VERIFIER_KIT_MEDIA_TYPE, VERIFIER_KIT_SCHEMA, VERIFIER_REFERENCE_SCHEMA, admitVerifierKit, assertVerifierKitManifest, assertVerifierReference, extractVerifierKit, inspectVerifierKit, packVerifierKit, readCachedVerifierKit, resolveVerifierKit, runRestrictedVerifier, verifierReferenceFromExtensions, type InspectedVerifierKit, type PackVerifierKitInput, type PackedVerifierKit, type ResolveVerifierKitOptions, type RestrictedVerifierRequest, type RestrictedVerifierResponse, type RestrictedVerifierRunner, type VerifierKitLimits, type VerifierKitManifestV1, type VerifierKitResolution, type VerifierReferenceV1, } from './verifier-kit.js';
export { ContainerVerifierRunner, containerVerifierInvocation, type ContainerVerifierInvocation, type ContainerVerifierRunnerOptions, } from './container-verifier-runner.js';
/** Namespaced hosted-Arena concurrency extension. */
export declare const ARENA_CONTROL_EXTENSION: "agilabs.arena";
/** Typed Arena payload carried inside the protocol extension object. */
export interface ArenaControlExtensions extends ProtocolExtensions {
    [ARENA_CONTROL_EXTENSION]: {
        controlRevision: number;
    };
}
export interface ActionDef {
    id: string;
    params: 'none' | 'xy' | 'index';
    text?: string;
}
export interface VisualEvent {
    type: string;
    [key: string]: unknown;
}
export interface ObservationCharacter {
    id: string;
    /** Owning participant/seat in simultaneous modes such as Arena. */
    participantId?: string;
    team: string;
    /** Top-left footprint anchor in wire coordinates `[x, y]`. */
    at: [number, number];
    footprint?: {
        width: number;
        height: number;
    };
    elevated?: boolean;
    character?: string;
    cast?: string;
    controlMode?: 'direct' | 'conversation';
    activationGroup?: string;
    conversionLocked?: boolean;
    abilities?: string[];
    statuses?: Array<{
        kind: string;
        phase?: string;
        remaining?: number;
        capacity?: number;
        radius?: number;
        dir?: [number, number];
        range?: number;
    }>;
}
export interface ObservationUnit extends ObservationCharacter {
    hp: number;
    maxHp: number;
}
export interface ObservationHud {
    /** Visible Archive File position in client coordinates [x, y]. */
    archiveAt?: [number, number];
    actionsUsed: number;
    maxActions: number;
    actionBudgetUsed?: number;
    actionBudgetMax?: number;
    energyUsed?: number;
    energyCap?: number;
    carrying: number | null;
    items?: Array<{
        index: number;
        kind: string;
        shape?: number;
        charge?: number;
        targetRange: number;
        targetKind: string;
    }>;
    /** Existing battle-unit integrity contract. */
    units?: ObservationUnit[];
    /** Batteries seated in plug sockets, including their remaining charge. */
    pluggedBatteries?: Array<{
        at: [number, number];
        charge: number;
    }>;
    /** Additive cast/control observation, also present outside combat. */
    characters?: ObservationCharacter[];
    mode?: string;
    targetableCells?: Array<[number, number]>;
    actionTargeting?: Record<string, {
        targetableCells: Array<[number, number]>;
        npcPathPreviewOrigin?: [number, number];
        npcPathPreviewKind?: 'move' | 'pickup' | 'throw' | 'ray' | 'footprint' | 'direction' | 'hack' | 'shield';
        npcPathPreviewFootprint?: [number, number];
        npcPathPreviewRange?: number;
    }>;
    npcPathPreviewOrigin?: [number, number];
    npcPathPreviewKind?: 'move' | 'pickup' | 'throw' | 'ray' | 'footprint' | 'direction' | 'hack' | 'shield';
    npcPathPreviewFootprint?: [number, number];
    npcPathPreviewRange?: number;
    npcPathPreviewTarget?: [number, number];
    npcPathPreviewCells?: Array<[number, number]>;
    dialogueOptions?: Array<{
        index: number;
        text: string;
    }>;
    pois?: Array<{
        index: number;
        label: string;
        at: [number, number];
    }>;
    /** Interrogation / stealth cover meter (Intelligence-Lies, Jailbreak). */
    suspicion?: number;
    suspicionCap?: number;
    /** Multi-goal objective slot (Jailbreak): visible + hidden goals. */
    objectives?: Array<{
        id: string;
        label: string;
        done: boolean;
    }>;
    /** Seat-relative terminal Arena result. Draws retain status="failed" for
     * protocol compatibility and are distinguished here. */
    arenaOutcome?: 'won' | 'lost' | 'draw';
    /** Cells currently inside a guard's sightline (Jailbreak). */
    watchedCells?: Array<[number, number]>;
    /** Destinations a commanded NPC is walking toward (Signal Language). */
    waypoints?: Array<[number, number]>;
    /** Conversation anchor — who the agent is addressing (dialogue GUI). */
    talkingTo?: {
        id: string;
        at: [number, number];
        character?: string;
        emotion?: string;
        speaker?: 'npc' | 'player';
    };
    dialogueSpeaker?: 'npc' | 'player';
    dialogueEmotion?: string;
}
export interface GameObservation {
    tickNumber: number;
    /** Seat-local UI/control substep. Arena may advance this without resolving the world tick. */
    controlRevision?: number;
    narrative: string | null;
    grid: string;
    visualEvents: VisualEvent[];
    actions: ActionDef[];
    /** Semantic host controls that are not shuffled or legality-filtered. */
    systemActions?: ActionDef[];
    status: 'playing' | 'won' | 'failed';
    stars?: number;
    hud: ObservationHud;
}
export interface SessionRequest {
    gameMode: 'story' | 'challenge' | 'escape';
    playMethod: 'human' | 'coach' | 'autonomous_local' | 'autonomous_scored';
    /** Per-level sessions (human/coach/autonomous_local practice). */
    levelId?: string;
    /** Play a published community level instead of an official one (any
     *  unscored play method: human, coach, autonomous_local). */
    communityLevelId?: string;
    /** Editor playtest: play this exact LevelConfig inline, so drafts and
     *  just-saved edits run verbatim without a publish or worker reload. */
    level?: unknown;
    /**
     * Challenge autonomous_scored: the run spans this game type's FULL scored
     * level set as one session (level_advance events roll it level-to-level).
     * A single-level scored request is not a valid shape.
     */
    gameId?: string;
    seasonId?: string;
    /** Debug console only: override the level's capability locks (e.g. ['attack']). */
    unlocks?: string[];
    /** Required player seats for games with a simultaneous `resolveTick` adapter. */
    participants?: string[];
}
export interface ActionSubmit {
    id: string;
    x?: number;
    y?: number;
    index?: number;
}
export interface RunSummary {
    gameId: string;
    levels: number;
    results: Array<{
        levelId: string;
        status: 'won' | 'failed';
        stars: number | null;
        actionsUsed: number;
    }>;
    totalStars: number;
    totalSteps: number;
}
export interface SubmitSummary {
    sessionId: string;
    status: 'won' | 'failed';
    stars: number | null;
    actionsUsed: number;
    transcriptLength: number;
    /** Present for game-type scored runs: the per-level results and totals. */
    run?: RunSummary;
}
export interface SessionBinding extends TickCursor {
    sessionId: string;
    participantId: string;
    protocol: typeof PROTOCOL_ID;
    protocolVersion: typeof PROTOCOL_VERSION;
    /** Latest seat-local Arena control substep, when exposed by the game observation. */
    controlRevision?: number;
}
/** Validate a persisted binding before restoring it into a client process. */
export declare function parseSessionBinding(value: unknown): SessionBinding;
export interface SessionStart {
    sessionId: string;
    tick: GameObservation;
    /** Opaque concurrency binding to retain when handing a session between UIs. */
    binding: SessionBinding;
}
export interface ArenaQueueRequest {
    /** Public Arena exhibition map selected for this queue entry. */
    mapId: string;
    /** Game-owned roster/team preset; it is not an authenticated seat id. */
    teamId: string;
    /** Retry key. Omit only when the caller will not retry an ambiguous request. */
    requestId?: string;
}
export interface ArenaCatalog {
    maps: Array<{
        id: string;
        gameId: string;
        version: number;
        name: string;
    }>;
    teams: Array<{
        id: string;
        name: string;
        members: Array<{
            id: string;
            characterId: string;
            control: 'direct' | 'conversation';
        }>;
    }>;
}
export interface ArenaQueueTicket {
    queueId: string;
    ticketId: string;
    state: 'waiting' | 'matching' | 'matched' | 'completed' | 'cancelled' | 'expired';
    joinedAt: number;
    expiresAt: number;
    mapId: string;
    teamId: string;
    matchId: string | null;
    participantId: string | null;
}
export interface ArenaOutcome {
    winner: string | null;
    loser: string | null;
    reason: 'game' | 'disconnect' | 'idle' | 'abandoned';
    gameReason?: string;
}
export interface ArenaRoom<TObservation = GameObservation> {
    matchId: string;
    sessionId: string;
    status: 'connecting' | 'active' | 'completed' | 'expired';
    participantId: string;
    readyDeadline: number;
    tickDeadline: number | null;
    expiresAt: number | null;
    participants: Array<{
        participantId: string;
        claimed: boolean;
        connected: boolean;
        reconnectDeadline: number | null;
    }>;
    /** Authoritative when network policy completes a still-playing game tick. */
    outcome: ArenaOutcome | null;
    tick: TickResult<TObservation>;
}
export declare class ProtocolMismatchError extends Error {
    constructor(message: string);
}
/** Runtime guard shared by clients that consume opaque game observations. */
export declare function parseTickResult<TObservation = unknown>(data: unknown): TickResult<TObservation>;
/** Agent API key metadata (GET /keys) — never includes key material. */
export interface AgentKeyInfo {
    id: string;
    label: string | null;
    createdAt: string;
    revokedAt: string | null;
}
export declare class ArenaApiError extends Error {
    status: number;
    error: string;
    code?: string | undefined;
    readonly details?: Readonly<Record<string, unknown>> | undefined;
    readonly responseBody?: string | undefined;
    /** Structured active-ticket recovery data returned by matchmaking 409s. */
    readonly ticket?: ArenaQueueTicket;
    constructor(status: number, error: string, code?: string | undefined, details?: Readonly<Record<string, unknown>> | undefined, responseBody?: string | undefined);
}
/** 422 — the action was not in the legal set for this tick. */
export declare class IllegalActionRejected extends ArenaApiError {
    constructor(status: number, error: string, code?: string, details?: Readonly<Record<string, unknown>>, responseBody?: string);
}
/**
 * Bearer credential for API calls: a static key ("ak_…" agent keys), or a
 * provider function re-read on EVERY request — auth tokens (e.g. Supabase
 * access JWTs) rotate, so callers pass a getter and the freshest token is
 * attached per call. Returning null/undefined sends the request anonymous.
 */
export type ApiKeyProvider = string | (() => string | null | undefined | Promise<string | null | undefined>);
export interface ArenaClientOptions {
    /** Fetch implementation used for every request. Defaults to global fetch. */
    fetch?: typeof fetch;
    /** Request timeout in milliseconds. Defaults to 30,000; set to zero to disable. */
    timeoutMs?: number;
    /** Signal shared by every request made by this client. */
    signal?: AbortSignal;
    /** Maximum response body size in bytes. Defaults to 1 MiB. */
    maxResponseBytes?: number;
}
export interface ArenaCallOptions {
    /** Signal scoped to this request only. */
    signal?: AbortSignal;
}
export declare class ArenaClient {
    private baseUrl;
    private apiKey?;
    private readonly options;
    private readonly bindings;
    private readonly observedArenaCursors;
    private readonly request;
    constructor(baseUrl?: string, apiKey?: ApiKeyProvider | undefined, options?: ArenaClientOptions);
    private remember;
    /** Return a JSON-safe snapshot for persistence across process restarts. */
    getSessionBinding(sessionId: string): SessionBinding | undefined;
    /** Restore a previously persisted cursor/seat binding for exact retries. */
    restoreSessionBinding(value: unknown): SessionBinding;
    private parse;
    private parseArenaRoom;
    private call;
    createSession(req: SessionRequest, participantId?: string, callOptions?: ArenaCallOptions): Promise<SessionStart>;
    getTickEnvelope(sessionId: string, callOptions?: ArenaCallOptions): Promise<TickResult<GameObservation>>;
    /** Compatibility view: returns the latest resolved observation while pending. */
    getTick(sessionId: string, callOptions?: ArenaCallOptions): Promise<GameObservation>;
    /** Stable primitive for any JSON command and any game observation shape. */
    submitIntent<TCommand, TObservation = GameObservation>(sessionId: string, command: TCommand, opts?: {
        participantId?: string;
        submissionId?: string;
        cursor?: TickCursor;
        signal?: AbortSignal;
    }): Promise<TickResult<TObservation>>;
    private submitIntentTo;
    arenaCatalog(callOptions?: ArenaCallOptions): Promise<ArenaCatalog>;
    /** Join the authenticated live queue. Reuse requestId after network ambiguity. */
    joinArenaQueue(req: ArenaQueueRequest, callOptions?: ArenaCallOptions): Promise<ArenaQueueTicket>;
    arenaQueueTicket(queueId: string, ticketId: string, callOptions?: ArenaCallOptions): Promise<ArenaQueueTicket>;
    cancelArenaQueueTicket(queueId: string, ticketId: string, callOptions?: ArenaCallOptions): Promise<ArenaQueueTicket>;
    /** Read-only room recovery snapshot; it does not claim or heartbeat a seat. */
    getArenaRoom<TObservation = GameObservation>(matchId: string, callOptions?: ArenaCallOptions): Promise<ArenaRoom<TObservation>>;
    setArenaPresence<TObservation = GameObservation>(matchId: string, connected: boolean, callOptions?: ArenaCallOptions): Promise<ArenaRoom<TObservation>>;
    heartbeatArenaMatch<TObservation = GameObservation>(matchId: string, callOptions?: ArenaCallOptions): Promise<ArenaRoom<TObservation>>;
    /** Required after matching. The second claimed seat atomically starts tick timers. */
    connectArenaMatch<TObservation = GameObservation>(matchId: string, callOptions?: ArenaCallOptions): Promise<ArenaRoom<TObservation>>;
    disconnectArenaMatch<TObservation = GameObservation>(matchId: string, callOptions?: ArenaCallOptions): Promise<ArenaRoom<TObservation>>;
    getArenaTickEnvelope<TObservation = GameObservation>(matchId: string, callOptions?: ArenaCallOptions): Promise<TickResult<TObservation>>;
    submitArenaIntent<TCommand, TObservation = GameObservation>(matchId: string, command: TCommand, opts?: {
        submissionId?: string;
        cursor?: TickCursor & {
            controlRevision?: number;
        };
        controlRevision?: number;
        signal?: AbortSignal;
    }): Promise<TickResult<TObservation>>;
    /**
     * Arena convenience wrapper. Solo ticks resolve in one request; if a
     * future multiplayer Arena adapter returns pending, poll for a bounded time.
     * Generic games should call `submitIntent` and handle the discriminated union.
     */
    submitAction(sessionId: string, action: ActionSubmit, opts?: {
        participantId?: string;
        submissionId?: string;
        pollIntervalMs?: number;
        maxPollAttempts?: number;
        signal?: AbortSignal;
    }): Promise<GameObservation>;
    submitSession(sessionId: string, opts?: {
        harnessCategory?: 'llm-driven' | 'solver-assisted';
    }, callOptions?: ArenaCallOptions): Promise<SubmitSummary>;
    labLevelVersions(callOptions?: ArenaCallOptions): Promise<Array<{
        levelId: string;
        version: number;
    }>>;
    /** Self-report an unpaid Challenge claim (authenticated, stored unverified). */
    reportUnpaidChallenge(claim: {
        gameId: string;
        stars: number;
        steps: number;
    }, callOptions?: ArenaCallOptions): Promise<{
        recorded: boolean;
    }>;
    challengeBoards(gameId: string, callOptions?: ArenaCallOptions): Promise<{
        paid: unknown[];
        unpaid: unknown[];
    }>;
    /** The caller's agent keys — metadata only, never hashes or plaintexts. */
    listKeys(callOptions?: ArenaCallOptions): Promise<AgentKeyInfo[]>;
    /** Mint an agent key. The plaintext `key` is returned exactly ONCE. */
    createKey(label?: string, callOptions?: ArenaCallOptions): Promise<{
        key: string;
        label: string | null;
    }>;
    /** Revoke an agent key by id (owners only; admins can revoke any). */
    revokeKey(id: string, callOptions?: ArenaCallOptions): Promise<{
        revoked: boolean;
    }>;
}
