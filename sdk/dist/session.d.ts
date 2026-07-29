import { PROTOCOL_ID, PROTOCOL_VERSION, IntentCollectionError, type CommandSubmission, type IntentWindow, type JsonObject, type JsonValue, type SubmissionIntegrityReservation } from './protocol.js';
export { IntentCollectionError };
export { createTickRate } from './engine/index.js';
export type { CommandSubmission, IntentErrorCode, JsonObject, JsonValue, } from './protocol.js';
export type { Dmath, Reducer, ReplayArtifact, ReplayGameRef, ReplayMetrics, ReplaySeedPolicy, SessionView, SubmittedAction, TickRate, TickView, TranscriptVisibility, } from './engine/index.js';
import { COMMITMENT_SCHEME, type CommitmentEnvelope, type Dmath, type Reducer, type ReplayArtifact, type ReplayGameRef, type ReplaySeedPolicy, type ReplayTickTimeoutPolicy, type ReplayTimeoutContext, type SubmissionSeatKey, type SubmissionSignaturePolicy, type SubmittedAction, type SessionView, type TickRate, type TickView, type TranscriptVisibility } from './engine/index.js';
import { applyJsonPatch, createJsonPatch, isJsonProjection, type JsonPatchOperation } from './observation-codec.js';
export { applyJsonPatch, createJsonPatch, isJsonProjection };
export type { JsonPatchOperation };
export interface SessionLimits {
    /** Maximum distance a tick target may be ahead of the open tick. */
    maxFutureTicks?: number;
    /** Maximum ticks resolved by one `prepareAdvance` call. */
    maxCatchUpTicks?: number;
    /** Receipts retained per seat, measured in resolved windows. */
    receiptRetention?: number;
    /** Maximum canonical bytes accepted by one extension record. */
    maxExtensionBytes?: number;
    /** Resolved ticks between audit checkpoint events. */
    checkpointInterval?: number;
    /** Maximum unresolved commitments retained for one seat. */
    maxOpenCommitmentsPerSeat?: number;
}
export interface SessionStateIsolation<TState> {
    fork(state: TState): TState;
    discard?(draft: TState): void;
    retire?(previous: TState): void;
}
export interface SessionCheckpointCodec<TState> {
    id: string;
    version: string;
    encode(state: TState): JsonValue;
    decode(value: JsonValue): TState;
}
/**
 * Permanent session identities move to host storage when the live kernel is
 * compacted. Lookups remain synchronous because the kernel itself is
 * synchronous; hosts preflight or cache the durable answer before entering it.
 */
export interface SessionHistoryLookup {
    gameplaySubmission(participantId: string, submissionId: string): boolean;
    interestCommand(participantId: string, submissionId: string): string | undefined;
    saltIdentity(salt: string): string | undefined;
}
interface KernelCheckpointReceipt {
    key: string;
    canonicalCommand: string;
    tickId: string;
    receipt: IngestReceipt;
    cursor: number;
}
interface KernelCheckpointView {
    seat: string;
    view: unknown;
    canonical: string;
    revision: number;
}
interface KernelCheckpointInterest {
    key: string;
    participantId: string;
    scopeId: string;
    declared: boolean;
    declaration: JsonValue;
    view: unknown;
    canonical: string;
    patchBackoffRemaining: number;
    patchBackoffWindow: number;
}
interface RetainedRejection {
    transitionRevision: number;
    tick: number;
    participantId: string;
    submissionId: string;
    code: 'commit_mismatch';
}
export interface KernelCheckpoint<TLevel = unknown, TCommand extends JsonValue = JsonValue> {
    format: 'gaos.kernel-checkpoint';
    formatVersion: '1.0';
    header: SessionHeader<TLevel>;
    codec: {
        id: string;
        version: string;
    };
    watermark: {
        transitionRevision: number;
        cursor: number;
        tick: number;
        lastCheckpointTick: number;
    };
    reducerState: JsonValue;
    window: IntentWindow<TCommand>;
    protocol: {
        receipts: KernelCheckpointReceipt[];
        expiredReceiptKeys: string[];
        views: KernelCheckpointView[];
        commitments: Array<{
            key: string;
            value: {
                envelope: CommitmentEnvelope;
                seat: string;
                windowRef: number;
                revealed: boolean;
            };
        }>;
        nextCommitmentIds: Array<[string, number]>;
        seenSalts: Array<[string, string]>;
        interests: KernelCheckpointInterest[];
        rejections: RetainedRejection[];
        historicalSubmissionKeys: string[];
        historicalInterestCommands: Array<[string, string]>;
    };
    retentionFloor: number;
    stateDigest: number;
    integrityDigest: string;
}
export interface SnapshotResyncRequired {
    status: 'resync_required';
    requestedTransitionRevision: number;
    retentionFloor: number;
    currentTransitionRevision: number;
}
export type SnapshotResult<TView> = ObservationDelta<TView> | SnapshotResyncRequired;
export interface CompactionConfirmation {
    checkpointDigest: string;
    checkpointDurablyCommitted: true;
    historyDurablyCommitted: true;
}
/**
 * Observation delivery tuning. Every option trades **CPU against bandwidth**;
 * the defaults suit a small table. See the "Tuning observation delivery"
 * section of the sessions and integrity guide for measured effects, and run
 * `npm run observations:benchmark` against your own views before changing any
 * of them.
 *
 * The one shape the defaults do not decide well is a **large table with light
 * per-tick churn**: patches win hugely on bytes there and never trigger
 * backoff, so they hold ~2× the encode CPU indefinitely. A CPU-bound host at
 * that shape usually wants `patchStrategy: 'never'` plus transport compression.
 */
export interface ObservationCodecV2Options {
    version: 'v2';
    /**
     * `adaptive` probes patches and temporarily backs off after a snapshot wins.
     * `never` emits v2 snapshot/unchanged bodies without walking a diff.
     * Default `adaptive`.
     */
    patchStrategy?: 'adaptive' | 'never';
    /**
     * Initial changed observations to emit as snapshots after a probe loses.
     * Repeated losses double the window. Default 8; set to 0 to always probe.
     */
    patchBackoffTicks?: number;
    /**
     * Maximum exponential backoff window. Defaults to at least 32 and never
     * below `patchBackoffTicks`.
     */
    maxPatchBackoffTicks?: number;
    /**
     * Abandon the diff once it exceeds this many operations. Default 2048.
     * Lower it to cap the cost of walks that were never going to pay; the
     * penalty is that large-but-genuine patches degrade to snapshots.
     */
    maxOperations?: number;
    /**
     * Reject a patch whose canonical form exceeds this many bytes. Default
     * 65536. Same trade as `maxOperations`, measured in bytes rather than ops.
     */
    maxBytes?: number;
    /**
     * Minimum snapshot:patch size ratio required to ship a patch. Default 4.
     *
     * A pure "is the patch smaller" test takes any marginal byte win at any CPU
     * price: measured at 500 entities with every entity moving, a patch 7 %
     * smaller than the snapshot cost 15.02 ms against the snapshot's 2.81 ms.
     * Patching is only worth its CPU when it wins by a wide margin, so the
     * default demands one. Set to 1 to restore the pure byte comparison.
     */
    minReduction?: number;
}
export interface CommandContext {
    readonly sessionId: string;
    readonly participantId: string;
    readonly submissionId: string;
    readonly cursor: number;
    readonly tick: number;
}
export interface InterestContext {
    readonly sessionId: string;
    readonly participantId: string;
    readonly scopeId: string;
    readonly cursor: number;
    readonly tick: number;
    readonly declaration: JsonValue;
}
export interface InterestPolicy<TView> {
    narrowView(view: TView, context: InterestContext): TView;
    maxScopesPerSeat?: number;
}
export interface InterestSubmission extends SubmissionIntegrityReservation {
    protocol: typeof PROTOCOL_ID;
    protocolVersion: typeof PROTOCOL_VERSION;
    sessionId: string;
    tickId: string;
    revision: number;
    participantId: string;
    submissionId: string;
    scopeId: string;
    declaration: JsonValue;
}
export interface SessionKernelOptions<TLevel, TState, TCommand extends JsonValue, TView extends SessionView> {
    sessionId: string;
    game: ReplayGameRef;
    levelId: string;
    levelVersion?: string | number;
    reducer: Reducer<TLevel, TState, TView>;
    level: TLevel;
    seed: number;
    seedPolicy: ReplaySeedPolicy;
    seats: readonly string[];
    cadence: {
        mode: 'turns';
    } | {
        mode: 'ticks';
        rate: TickRate;
    };
    commandToAction(command: TCommand, context: CommandContext): SubmittedAction;
    /**
     * Required host timestamp policy. A provider returns UTC epoch
     * milliseconds (`Date.now()` is suitable; `performance.now()` is not).
     * Use `'none'` for byte-reproducible transcripts with no timestamp field.
     * Ordering always uses tick/cursor/transitionRevision, never this clock.
     */
    hostTime: (() => number) | 'none';
    /**
     * Opaque v0.19 reservation in unsigned sessions. Signed v1.2 sessions
     * assign tick-bounded semantics to `{ mode: 'ticks', windowTicks: N }`.
     */
    timeoutPolicy?: JsonObject | ReplayTickTimeoutPolicy;
    /** Pure, versioned adapter used to derive every timeout system action. */
    timeoutToAction?: {
        bivarianceHack(context: ReplayTimeoutContext<TLevel>, timeout: TimeoutInput): SubmittedAction;
    }['bivarianceHack'];
    /** RFC-010 key roster. Supplying it opts finalized artifacts into v1.2. */
    seatKeys?: readonly SubmissionSeatKey[];
    /** Required with `seatKeys`; fixes the complete signing construction. */
    signaturePolicy?: SubmissionSignaturePolicy;
    dmath?: Dmath;
    limits?: SessionLimits;
    stateIsolation?: SessionStateIsolation<TState>;
    checkpointCodec?: SessionCheckpointCodec<TState>;
    historyLookup?: SessionHistoryLookup;
    /**
     * Mandatory v2 observation delivery. Adaptive bounded patches are the
     * default; use `patchStrategy: 'never'` for v2 snapshots without diff CPU.
     */
    observationCodec?: ObservationCodecV2Options;
    /** Product projection applied only after the seat's partitioned view exists. */
    interest?: InterestPolicy<TView>;
}
export interface SessionHeader<TLevel = unknown> {
    sessionId: string;
    game: ReplayGameRef;
    levelId: string;
    levelVersion?: string | number;
    level: TLevel;
    seed: number;
    seedPolicy: ReplaySeedPolicy;
    seats: readonly string[];
    cadence: {
        mode: 'turns';
    } | {
        mode: 'ticks';
        ticksPerSecond: number;
    };
    timeoutPolicy?: JsonObject | ReplayTickTimeoutPolicy;
    seatKeys?: readonly SubmissionSeatKey[];
    signaturePolicy?: SubmissionSignaturePolicy;
    dmath?: {
        algorithm: string;
        backend: 'js' | 'wasm';
    };
}
interface SessionEventBase {
    eventId: string;
    transitionRevision: number;
    /** Advisory host UTC milliseconds; never reducer input or authentication evidence. */
    hostTime?: number;
}
export interface CanonicalInput extends SubmissionIntegrityReservation {
    participantId: string | null;
    submissionId: string | null;
    canonicalCommand?: string;
    cursor?: number;
    action: SubmittedAction;
}
export type SessionEvent = (SessionEventBase & {
    kind: 'intent-accepted';
    tick: number;
    revision: number;
    participantId: string;
    submissionId: string;
    command: JsonValue;
    canonicalCommand: string;
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
}) | (SessionEventBase & {
    kind: 'resolution';
    tick: number;
    cursor: number;
    cause: 'complete' | 'timeout' | 'tick';
    consumed: ReadonlyArray<{
        participantId: string;
        submissionId: string;
    }>;
    inputs: readonly CanonicalInput[];
    /** Exact host-derived input for a timeout resolution. */
    systemInput?: CanonicalInput;
    result: {
        status: 'playing' | 'won' | 'failed' | 'ended';
        stars: number | null;
        actionsUsed: number;
    };
}) | (SessionEventBase & {
    kind: 'timeout';
    tick: number;
    timeoutId: string;
    windowRef: number;
    participantId: string | null;
    /** Why the host concluded that the seat would not respond. */
    reason: string;
    /** v1.2 uses the fixed `header.timeoutPolicy` reference. */
    timeoutPolicyRef?: string;
}) | (SessionEventBase & {
    kind: 'extension';
    tick: number;
    lane: string;
    record: JsonObject;
}) | (SessionEventBase & {
    kind: 'interest';
    tick: number;
    cursor: number;
    participantId: string;
    submissionId: string;
    scopeId: string;
    declaration: JsonValue;
    canonicalCommand: string;
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
}) | (SessionEventBase & {
    kind: 'seat-signature';
    tick: number;
    participantId: string;
    clientTime: number;
    prevChainHash: string;
    sig: string;
}) | (SessionEventBase & {
    kind: 'checkpoint';
    tick: number;
    digest: number;
}) | (SessionEventBase & {
    kind: 'rejection';
    code: 'commit_mismatch';
    tick: number;
    participantId: string;
    submissionId: string;
    commitmentId: number;
    scheme: typeof COMMITMENT_SCHEME;
    attemptedReveal: {
        salt: string;
        payload: JsonValue;
    };
    /** RFC-010 reservation for the rejected signed command. */
    canonicalCommand?: string;
    /** RFC-010 reservation for the rejected command cursor. */
    cursor?: number;
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
});
export interface SessionTranscript<TLevel = unknown> {
    header: SessionHeader<TLevel>;
    events: readonly SessionEvent[];
}
export interface ObservationDelta<TView = TickView<unknown, unknown>> {
    seat: string;
    /** Named delivery scope. Defaults to the seat id for compatibility. */
    scopeId?: string;
    /** Scope declaration that makes omission distinguishable from no change. */
    interest?: {
        declaration: JsonValue;
    };
    /** Durable transition watermark used to resume rejection delivery. */
    transitionRevision: number;
    viewRevision: number;
    tick: number;
    codec: 'v2';
    /** How this envelope was produced. Absent is read as `resolution`. */
    origin?: 'resolution' | 'snapshot' | 'interest';
    /**
     * Applied user inputs in canonical reducer order for this view revision.
     * A reconnect snapshot applies no new input and therefore carries `[]`.
     */
    acknowledgements: readonly ObservationAcknowledgement[];
    /** Rejected identities ordered within this durable transition. */
    rejections: readonly ObservationRejectionNotice[];
    body: {
        kind: 'snapshot';
        view: TView;
    } | {
        kind: 'patch';
        operations: readonly JsonPatchOperation[];
    } | {
        kind: 'unchanged';
    };
    /** Diagnostic only; not authentication or anti-cheat evidence. */
    viewDigest: number;
}
export interface ObservationAcknowledgement {
    participantId: string;
    submissionId: string;
}
export interface IngestReceipt {
    status: 'accepted' | 'duplicate';
    participantId: string;
    submissionId: string;
    cursor: number;
    tick: number;
    submittedParticipants: readonly string[];
    awaitingParticipants: readonly string[];
    /** True when the accepted window has already resolved. */
    resolved: boolean;
}
export interface InterestReceipt {
    status: 'accepted' | 'duplicate';
    participantId: string;
    submissionId: string;
    scopeId: string;
    cursor: number;
    tick: number;
}
export interface AdvanceSummary<TView> {
    resolutions: number;
    partial: boolean;
    cursor: number;
    tick: number;
    digest: number;
    deltas: readonly ObservationDelta<TView>[];
    /** Per-seat notices for rejected inputs that did not advance gameplay. */
    rejections: readonly ObservationRejectionNotice[];
    /** Non-fatal integrity warnings observed while preparing this advance. */
    warnings: readonly SessionWarning[];
}
export interface ObservationRejectionNotice {
    /** Destination seat for this notice. */
    seat: string;
    transitionRevision: number;
    tick: number;
    participantId: string;
    submissionId: string;
    code: 'commit_mismatch';
}
export interface SessionWarning {
    code: 'salt_reuse';
    message: string;
    participantId: string;
    commitmentId: number;
}
export interface TimeoutInput {
    timeoutId: string;
    tick: number;
    participantId?: string | null;
    /** `elapsed`, `disconnect`, or a product-defined non-empty reason. */
    reason: string;
    /** Must be `header.timeoutPolicy` for a signed tick-bounded policy. */
    timeoutPolicyRef?: string;
}
export interface SeatSignatureInput {
    participantId: string;
    tick: number;
    clientTime: number;
    prevChainHash: string;
    sig: string;
}
export interface FinalizeOptions {
    perm: number[];
    visibility?: TranscriptVisibility;
    extensions?: JsonObject;
    /** Opt in to projecting advisory session-event times into replay records. */
    includeHostTime?: boolean;
}
export interface FinalizeRunOptions extends FinalizeOptions {
    /** Authoritative run seed used to derive every ordered level seed. */
    seed: number;
    /** Whether a run stops on loss or deliberately plays every pinned level. */
    advancePolicy?: 'win-to-advance' | 'play-all-levels';
}
declare const preparedTransition: unique symbol;
export interface Prepared<TResult, TView = TickView<unknown, unknown>> {
    readonly baseTransitionRevision: number;
    readonly nextTransitionRevision: number;
    readonly events: readonly SessionEvent[];
    readonly deltas: readonly ObservationDelta<TView>[];
    readonly result: TResult;
    /** Opaque package-owned transition payload. */
    readonly [preparedTransition]: unknown;
}
export type PreparedTransitionErrorCode = 'foreign' | 'stale' | 'already_completed';
export type SessionConflictErrorCode = 'conflict' | 'unknown_submission';
export declare class PreparedTransitionError extends Error {
    readonly code: PreparedTransitionErrorCode;
    constructor(code: PreparedTransitionErrorCode, message: string);
}
export declare class SessionConflictError extends Error {
    readonly code: SessionConflictErrorCode;
    constructor(code: SessionConflictErrorCode, message: string);
    constructor(message: string);
}
export declare class SessionAdvanceError extends Error {
    readonly code: 'not_ready' | 'stale_target' | 'invalid_target' | 'invalid_view' | 'terminal';
    constructor(code: 'not_ready' | 'stale_target' | 'invalid_target' | 'invalid_view' | 'terminal', message: string);
}
export interface SessionKernel<TCommand extends JsonValue, TView, TLevel = unknown> {
    prepareIngest(submission: CommandSubmission<TCommand>): Prepared<IngestReceipt, TView>;
    prepareAdvance(target?: number): Prepared<AdvanceSummary<TView>, TView>;
    prepareTimeout(timeout: TimeoutInput, forcedInput?: SubmittedAction): Prepared<AdvanceSummary<TView>, TView>;
    prepareExtension(lane: string, record: JsonObject): Prepared<void, TView>;
    prepareInterest(submission: InterestSubmission): Prepared<InterestReceipt, TView>;
    prepareSeatSignature(input: SeatSignatureInput): Prepared<void, TView>;
    commit(prepared: Prepared<unknown, TView>): void;
    abort(prepared: Prepared<unknown, TView>): void;
    observe(seat: string, scopeId?: string): TView;
    observeAll(): Readonly<Record<string, TView>>;
    awaitingSeats(): readonly string[];
    cursor(): number;
    tick(): number;
    nextDeadline(): number | undefined;
    viewRevision(seat: string): number;
    snapshot(seat: string): ObservationDelta<TView>;
    snapshot(seat: string, afterTransitionRevision: undefined, scopeId?: string): ObservationDelta<TView>;
    snapshot(seat: string, afterTransitionRevision: number, scopeId?: string): SnapshotResult<TView>;
    checkpoint(): KernelCheckpoint<TLevel, TCommand>;
    compact(checkpoint: KernelCheckpoint<TLevel, TCommand>, confirmation: CompactionConfirmation): void;
    retentionFloor(): number;
    sessionHeader(): SessionHeader<TLevel>;
    liveTranscript(): SessionTranscript;
    digest(): number;
}
/** Reconstruct and digest-check one v2 observation envelope. */
export declare function applyObservationDelta<TView>(previous: TView | undefined, delta: ObservationDelta<TView>): TView;
export interface PredictionSubmission<TCommand extends JsonValue> {
    participantId: string;
    submissionId: string;
    command: TCommand;
}
export interface PredictionSessionOptions<TCommand extends JsonValue, TView> {
    initial?: {
        view: TView;
        transitionRevision: number;
        viewRevision: number;
    };
    applyPending(view: TView, submission: PredictionSubmission<TCommand>): TView;
}
export type PredictionReconcileResult<TView> = {
    status: 'applied';
    view: TView;
    transitionRevision: number;
    viewRevision: number;
    settled: readonly string[];
    reapplied: readonly string[];
    rolledBack: boolean;
} | {
    status: 'ignored';
    view: TView;
    transitionRevision: number;
    viewRevision: number;
} | {
    status: 'resync_required';
    reason: 'missing_base' | 'transition_gap' | 'invalid_delta';
    expectedTransitionRevision?: number;
    receivedTransitionRevision: number;
};
/**
 * Client-side optimistic reconciliation over authoritative observation
 * deltas. Pending commands always replay in original local enqueue order.
 */
export declare class PredictionSession<TCommand extends JsonValue, TView> {
    private readonly options;
    private authoritative;
    private predicted;
    private transitionRevision;
    private authoritativeViewRevision;
    private readonly pendingSubmissions;
    constructor(options: PredictionSessionOptions<TCommand, TView>);
    predict(submission: PredictionSubmission<TCommand>): TView;
    reconcile(delta: ObservationDelta<TView>): PredictionReconcileResult<TView>;
    pending(): readonly PredictionSubmission<TCommand>[];
    view(): TView | undefined;
}
/** Derive the durable session header without initializing reducer state. */
export declare function sessionHeaderFor<TLevel, TState, TCommand extends JsonValue, TView extends SessionView>(options: SessionKernelOptions<TLevel, TState, TCommand, TView>): SessionHeader<TLevel>;
/** Create a new synchronous, IO-free authoritative session kernel. */
export declare function createSessionKernel<TLevel, TState, TCommand extends JsonValue, TView extends SessionView>(options: SessionKernelOptions<TLevel, TState, TCommand, TView>): SessionKernel<TCommand, TView, TLevel>;
/** Reconstruct a kernel from its durable accepted-intent and resolution log. */
export declare function rehydrateKernel<TLevel, TState, TCommand extends JsonValue, TView extends SessionView>(options: SessionKernelOptions<TLevel, TState, TCommand, TView>, transcript: SessionTranscript<TLevel> | readonly SessionEvent[]): SessionKernel<TCommand, TView, TLevel>;
/** Restore live state from a durable checkpoint and its contiguous event tail. */
export declare function rehydrateKernelFromCheckpoint<TLevel, TState, TCommand extends JsonValue, TView extends SessionView>(options: SessionKernelOptions<TLevel, TState, TCommand, TView>, checkpoint: KernelCheckpoint<TLevel, TCommand>, tail: readonly SessionEvent[]): SessionKernel<TCommand, TView, TLevel>;
/** Purely project a terminal live transcript into portable replay v1.1 or v1.2. */
export declare function finalizeReplay<TLevel>(transcript: SessionTranscript<TLevel>, options: FinalizeOptions): ReplayArtifact<TLevel>;
/**
 * Project an ordered, terminal sequence of one-level kernel transcripts into
 * one portable multi-level run. Per-level seeds must already equal the
 * derivation from `options.seed`.
 */
export declare function finalizeRunReplay<TLevel>(transcripts: readonly SessionTranscript<TLevel>[], options: FinalizeRunOptions): ReplayArtifact<TLevel>;
