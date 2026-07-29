import { type JsonValue, type JsonObject } from '../protocol.js';
import { type Reducer, type SessionView, type SubmittedAction } from './contracts.js';
import { COMMITMENT_SCHEME, type CommitmentEnvelope, type RevealEnvelope } from './commitment.js';
import { type Dmath } from './dmath.js';
import { type SubmissionSeatKey, type SubmissionSignaturePolicy } from './submission-signatures.js';
import { type RecheckOptions, type RecheckResult, type TranscriptAction, type TranscriptHeader, type TranscriptVisibility } from './replay.js';
/** Stable identifier carried by every SDK-owned portable replay. */
export declare const GAOS_REPLAY_FORMAT_ID: "gaos.replay";
/** Current schema version; adds replayable open-session termination. */
export declare const GAOS_REPLAY_FORMAT_VERSION: "1.3";
/** Signed submission and per-seat audit-chain compatibility version. */
export declare const GAOS_REPLAY_SIGNED_FORMAT_VERSION: "1.2";
/** Unsigned grouped/audit format accepted for migration compatibility. */
export declare const GAOS_REPLAY_UNSIGNED_FORMAT_VERSION: "1.1";
/** Action-only compatibility version accepted by the parser and verifier. */
export declare const GAOS_REPLAY_LEGACY_FORMAT_VERSION: "1.0";
export type ReplayFormatVersion = typeof GAOS_REPLAY_LEGACY_FORMAT_VERSION | typeof GAOS_REPLAY_UNSIGNED_FORMAT_VERSION | typeof GAOS_REPLAY_SIGNED_FORMAT_VERSION | typeof GAOS_REPLAY_FORMAT_VERSION;
/** Media type used by downloads, object storage, and module manifests. */
export declare const GAOS_REPLAY_MIME: "application/vnd.gaos.replay+jsonl";
/** Conventional filename extension, without a leading dot. */
export declare const GAOS_REPLAY_EXTENSION: "gaos-replay.jsonl";
/** Seed policy compatible with `runLevelSeed`. */
export declare const GAOS_REPLAY_DERIVED_SEEDS: "gaos.run-level-seed.v1";
/** Fixed reference used by v1.2 timeout records for the header policy. */
export declare const GAOS_TIMEOUT_POLICY_REF: "header.timeoutPolicy";
/**
 * Drop-in value for TabletopLabs-style `results.replayFormat` declarations.
 * Compression belongs to the surrounding transport, not the canonical bytes.
 */
export declare const GAOS_REPLAY_MANIFEST_FORMAT: Readonly<{
    mime: "application/vnd.gaos.replay+jsonl";
    extension: "gaos-replay.jsonl";
    compressed: false;
}>;
export type ReplaySeedPolicy = 'explicit' | typeof GAOS_REPLAY_DERIVED_SEEDS;
export interface ReplayTickTimeoutPolicy {
    mode: 'ticks';
    windowTicks: number;
}
/**
 * Selects the game and historical deterministic adapter needed to recheck it.
 * Products decide how these ids resolve to executable reducer code.
 */
export interface ReplayGameRef {
    id: string;
    version: string;
    adapter: {
        id: string;
        version: string;
    };
}
export interface ReplayLevelResult {
    status: 'won' | 'failed' | 'ended';
    stars: number | null;
    actionsUsed: number;
    /** Product-specific scores or benchmark facts; core recheck ignores them. */
    extensions?: JsonObject;
}
export interface ReplayLevelRecord<TLevel> {
    /** Zero-based position in the pinned run. */
    index: number;
    id: string;
    version?: string | number;
    /** Explicit even when derived, so each segment is independently inspectable. */
    seed: number;
    /** Self-contained reducer input pinned at the time of play. */
    level: TLevel;
    result: ReplayLevelResult;
    extensions?: JsonObject;
}
export interface ReplayTotals {
    totalStars: number;
    totalActionsUsed: number;
    extensions?: JsonObject;
}
/** v1.1 reservation shape; v1.2 requires every RFC-010 field. */
export interface ReplaySeatIntegrityReservation {
    id: string;
    publicKey?: string;
    alg?: string;
    signingTier?: {
        N: number;
    };
}
/** First line of a GAOS replay JSONL artifact. */
export interface ReplayHeader<TLevel> {
    kind: 'header';
    format: typeof GAOS_REPLAY_FORMAT_ID;
    formatVersion: ReplayFormatVersion;
    sessionId: string;
    game: ReplayGameRef;
    /** Run seed. Per-level seeds remain explicit in `levels`. */
    seed: number;
    seedPolicy: ReplaySeedPolicy;
    /** Default wire action index to canonical action index permutation. */
    perm: number[];
    levels: Array<ReplayLevelRecord<TLevel>>;
    totals: ReplayTotals;
    visibility?: TranscriptVisibility;
    /** RFC-010 key roster; opaque reservation only when reading v1.1. */
    seatKeys?: ReadonlyArray<ReplaySeatIntegrityReservation | SubmissionSeatKey>;
    /** RFC-010 construction policy; opaque reservation only when reading v1.1. */
    signaturePolicy?: JsonObject | SubmissionSignaturePolicy;
    /** Opaque in v1.1; v1.2 assigns tick-bounded timeout semantics. */
    timeoutPolicy?: JsonObject | ReplayTickTimeoutPolicy;
    /** Host, creator, agent, signing, or benchmark metadata. */
    extensions?: JsonObject;
}
/** Every line after the header is one canonical reducer input delta. */
export interface ReplayAction extends TranscriptAction {
    kind: 'action';
    levelIndex: number;
    /** Advisory host UTC milliseconds; ignored by replay verification. */
    hostTime?: number;
    /** RFC-010 reservations; ignored by the v1.1 verifier. */
    submissionId?: string;
    canonicalCommand?: string;
    cursor?: number;
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
    commit?: CommitmentEnvelope;
    reveal?: RevealEnvelope;
    /** Present only after a reveal has passed commitment verification. */
    verifiedPayload?: JsonValue;
}
export type ReplayResolutionInput = Omit<ReplayAction, 'kind' | 'n' | 'levelIndex' | 'tick'>;
/** One reducer call. Inputs are consumed atomically in their recorded order. */
export interface ReplayResolution {
    kind: 'resolution';
    n: number;
    levelIndex: number;
    tick: number;
    inputs: ReplayResolutionInput[];
    cause: 'complete' | 'timeout' | 'tick';
    /** Advisory host UTC milliseconds; ignored by replay verification. */
    hostTime?: number;
    /** Exact canonical timeout/pass action when the host supplied one. */
    systemInput?: ReplayResolutionInput;
}
export interface ReplayTimeout {
    kind: 'timeout';
    n: number;
    levelIndex: number;
    tick: number;
    timeoutId: string;
    windowRef: number;
    participantId: string | null;
    reason: string;
    /** v1.2 uses the fixed `header.timeoutPolicy` reference. */
    timeoutPolicyRef?: string;
    /** Advisory host UTC milliseconds; ignored by replay verification. */
    hostTime?: number;
}
export interface ReplayExtension {
    kind: 'extension';
    n: number;
    levelIndex: number;
    lane: string;
    record: JsonObject;
    /** Advisory host UTC milliseconds; ignored by replay verification. */
    hostTime?: number;
}
export interface ReplayInterest {
    kind: 'interest';
    n: number;
    levelIndex: number;
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
    hostTime?: number;
}
export interface ReplayCheckpoint {
    kind: 'checkpoint';
    n: number;
    levelIndex: number;
    tick: number;
    /** Diagnostic FNV-1a digest, not an authentication primitive. */
    digest: number;
    /** Advisory host UTC milliseconds; ignored by replay verification. */
    hostTime?: number;
}
export interface ReplayCommitMismatchAudit {
    kind: 'commit-mismatch';
    n: number;
    levelIndex: number;
    tick: number;
    participantId: string;
    submissionId: string;
    commitmentId: number;
    scheme: typeof COMMITMENT_SCHEME;
    /** RFC-010 reservations; ignored by the v1.1 verifier. */
    canonicalCommand?: string;
    cursor?: number;
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
    /** Advisory host UTC milliseconds; ignored by replay verification. */
    hostTime?: number;
    attemptedReveal?: {
        salt: string;
        payload: JsonValue;
    };
}
/**
 * RFC-010 tier-3 carrier reservation. v1.1 preserves this record but assigns
 * no cryptographic or chain semantics to it.
 */
export interface ReplaySeatSignatureReservation {
    kind: 'seat-signature';
    n: number;
    levelIndex: number;
    tick: number;
    participantId: string;
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
    hostTime?: number;
}
export type ReplayRecord = ReplayAction | ReplayResolution | ReplayTimeout | ReplayExtension | ReplayInterest | ReplayCheckpoint | ReplayCommitMismatchAudit | ReplaySeatSignatureReservation;
export interface ReplayArtifact<TLevel> {
    header: ReplayHeader<TLevel>;
    /** Compatibility projection for action-oriented v1.0 consumers. */
    actions: ReplayAction[];
    /** Ordered v1.1+ record stream. Absent on parsed v1.0/action-only artifacts. */
    records?: ReplayRecord[];
}
export interface ReplayLevelInput<TLevel> {
    id: string;
    version?: string | number;
    /**
     * Required for `explicit`; ignored and recomputed for the derived seed
     * policy so producers cannot accidentally write a different derivation.
     */
    seed?: number;
    level: TLevel;
    result: ReplayLevelResult;
    extensions?: JsonObject;
}
export interface ReplayActionInput extends TranscriptAction {
    levelIndex: number;
    hostTime?: number;
    submissionId?: string;
    canonicalCommand?: string;
    cursor?: number;
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
    commit?: CommitmentEnvelope;
    reveal?: RevealEnvelope;
    verifiedPayload?: JsonValue;
}
export interface CreateReplayArtifactInput<TLevel> {
    sessionId: string;
    game: ReplayGameRef;
    seed: number;
    seedPolicy?: ReplaySeedPolicy;
    perm: number[];
    levels: Array<ReplayLevelInput<TLevel>>;
    actions?: ReplayActionInput[];
    /** Supplying records opts into the v1.1+ grouped/audit transport. */
    records?: ReplayRecord[];
    totals?: ReplayTotals;
    visibility?: TranscriptVisibility;
    seatKeys?: readonly ReplaySeatIntegrityReservation[];
    signaturePolicy?: JsonObject | SubmissionSignaturePolicy;
    timeoutPolicy?: JsonObject | ReplayTickTimeoutPolicy;
    extensions?: JsonObject;
}
export interface TranscriptReplayOptions {
    game: ReplayGameRef;
    levelId: string;
    levelVersion?: string | number;
    extensions?: JsonObject;
}
export interface ReplayReducerContext<TLevel> {
    game: ReplayGameRef;
    level: ReplayLevelRecord<TLevel>;
    /** Constructed from the authoritative replay algorithm declaration. */
    dmath?: Dmath;
}
export interface ReplaySubmissionContext {
    sessionId: string;
    tick: number;
    cursor: number;
    participantId: string;
    submissionId: string;
}
export interface ReplayTimeoutContext<TLevel> {
    sessionId: string;
    game: ReplayGameRef;
    levelId: string;
    levelVersion?: string | number;
    level: TLevel;
    seed: number;
    participantId: string | null;
    windowRef: number;
}
export interface ReplaySemanticAdapter<TLevel> {
    commandToAction?: (command: JsonValue, context: ReplaySubmissionContext) => SubmittedAction;
    timeoutToAction?: (context: ReplayTimeoutContext<TLevel>, timeout: ReplayTimeout) => SubmittedAction;
}
export type ReplayReducerResolver<TLevel, TState, TView extends SessionView> = (context: ReplayReducerContext<TLevel>) => Reducer<TLevel, TState, TView> | undefined;
export interface ReplayArtifactRecheckOptions<TLevel, TState> {
    optionsForLevel?: (context: ReplayReducerContext<TLevel>) => RecheckOptions<TState> | undefined;
    /**
     * Historical pure adapter functions. A signed artifact is only `trusted`
     * when every applicable submission and timeout action is independently
     * reconstructed through these functions.
     */
    semanticAdapterForLevel?: (context: ReplayReducerContext<TLevel>) => ReplaySemanticAdapter<TLevel> | undefined;
}
export interface ReplayLevelRecheck {
    index: number;
    id: string;
    seed: number;
    result: RecheckResult;
}
export type ReplaySignatureState = 'signed' | 'partial' | 'unsigned';
export type ReplayVerificationVerdict = 'trusted' | 'unverifiable' | 'rejected';
export interface ReplaySeatSignatureCheck {
    seat: string;
    submissions: number;
    validSignatures: number;
    chainReproduced: boolean;
    policySatisfied: boolean;
    chainHead: string;
}
export interface ReplaySignatureCheck {
    state: ReplaySignatureState;
    problems: string[];
    seats: ReplaySeatSignatureCheck[];
}
export type ReplaySemanticState = 'verified' | 'unavailable' | 'not_applicable' | 'failed';
export interface ReplaySemanticCheck {
    submissions: ReplaySemanticState;
    timeouts: ReplaySemanticState;
    problems: string[];
}
export interface ReplayArtifactRecheckResult {
    ok: boolean;
    /** Adoption-level verdict; policy can require `trusted` for scored runs. */
    verdict: ReplayVerificationVerdict;
    /** Signature and chain facts remain orthogonal to deterministic replay `ok`. */
    signatures: ReplaySignatureCheck;
    /** Independent reconstruction of signed commands and host timeout actions. */
    semantics: ReplaySemanticCheck;
    problems: string[];
    /** Non-fatal audit limitations and security hygiene warnings. */
    diagnostics: string[];
    levels: ReplayLevelRecheck[];
    replayed: {
        statuses: string[];
        totalStars: number;
        totalActionsUsed: number;
    };
}
export declare class ReplayFormatError extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
/**
 * Build a normalized portable replay. Derived level seeds and aggregate totals
 * are computed here so Arena, TabletopLabs, and other producers write the same
 * envelope.
 */
export declare function createReplayArtifact<TLevel>(input: CreateReplayArtifactInput<TLevel>): ReplayArtifact<TLevel>;
/** Lift an existing single-level SDK transcript into the portable envelope. */
export declare function transcriptToReplayArtifact<TLevel>(header: TranscriptHeader<TLevel>, actions: TranscriptAction[], options: TranscriptReplayOptions): ReplayArtifact<TLevel>;
/**
 * Validate the transport envelope independently of game code. Reducer-level
 * legality and results are checked by `recheckReplayArtifact`.
 */
export declare function validateReplayArtifact(value: unknown): string[];
/** Canonical, trailing-newline JSONL suitable for hashing and object storage. */
export declare function serializeReplayJsonl<TLevel>(artifact: ReplayArtifact<TLevel>): string;
/** Parse and validate one SDK-owned replay JSONL artifact. */
export declare function parseReplayJsonl<TLevel = unknown>(jsonl: string): ReplayArtifact<TLevel>;
/**
 * Verify RFC-010 signatures and per-seat chains without invoking game code.
 * v1.0/v1.1 artifacts remain valid but are explicitly `unsigned`.
 */
export declare function recheckReplaySignatures(artifact: ReplayArtifact<unknown>): ReplaySignatureCheck;
/**
 * Recheck every level segment through the existing SDK reducer verifier, then
 * compare the run totals. Reducer selection is product-owned but keyed only by
 * the portable game/adapter/level declarations.
 */
export declare function recheckReplayArtifact<TLevel, TState, TView extends SessionView>(artifact: ReplayArtifact<TLevel>, resolveReducer: ReplayReducerResolver<TLevel, TState, TView>, options?: ReplayArtifactRecheckOptions<TLevel, TState>): ReplayArtifactRecheckResult;
