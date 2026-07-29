/**
 * Stable wire contracts for deterministic tick-based games.
 *
 * Observations and commands are deliberately opaque generic values. A grid
 * game may put a text board in an observation; a card game may put hands and
 * piles there. Values crossing the wire must be JSON-serializable.
 */
export declare const PROTOCOL_ID: "agilabs.ticks";
export declare const PROTOCOL_VERSION: "1.0";
/** Portable seat ids keep canonical ordering identical across SDK languages. */
export declare const PARTICIPANT_ID_PATTERN: "^[A-Za-z0-9_.:@-]{1,128}$";
export declare function isParticipantId(value: unknown): value is string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
    [key: string]: JsonValue;
}
export interface ProtocolExtensions extends JsonObject {
}
/** RFC-010 integrity fields; semantics activate under a v1.2 replay policy. */
export interface SubmissionIntegrityReservation {
    /**
     * Required for chained submissions. Recorded without judging the client
     * clock's correctness.
     */
    clientTime?: number;
    prevChainHash?: string;
    sig?: string;
}
export interface TickCursor {
    /** Stable identity of this revision, unique within a session. */
    tickId: string;
    /** Monotonically increasing resolved-tick revision, starting at zero. */
    revision: number;
}
interface EnvelopeBase extends TickCursor {
    protocol: typeof PROTOCOL_ID;
    protocolVersion: typeof PROTOCOL_VERSION;
    sessionId: string;
    extensions?: ProtocolExtensions;
}
/** A fully resolved observation. This is the only envelope renderers animate. */
export interface TickEnvelope<TObservation = unknown> extends EnvelopeBase {
    kind: 'tick';
    tick: TObservation;
}
/**
 * Acknowledges one collected input without advancing the tick. `tick` is the
 * last resolved observation, so clients can keep rendering while they wait.
 */
export interface PendingEnvelope<TObservation = unknown> extends EnvelopeBase {
    kind: 'pending';
    tick: TObservation;
    acceptedParticipantId?: string;
    submittedParticipants: string[];
    awaitingParticipants: string[];
}
export type TickResult<TObservation = unknown> = TickEnvelope<TObservation> | PendingEnvelope<TObservation>;
/** One participant's command for a specific unresolved tick. */
export interface CommandSubmission<TCommand = unknown> extends TickCursor, SubmissionIntegrityReservation {
    protocol: typeof PROTOCOL_ID;
    protocolVersion: typeof PROTOCOL_VERSION;
    sessionId: string;
    participantId: string;
    /** Required caller-generated idempotency key. Keep it stable for exact
     * retries, and use a new key for each logical command/control substep. */
    submissionId: string;
    command: TCommand;
    extensions?: ProtocolExtensions;
}
export interface CollectedIntent<TCommand = unknown> extends SubmissionIntegrityReservation {
    participantId: string;
    submissionId: string;
    command: TCommand;
}
/**
 * Host-independent game registration seam. A game resolves one complete,
 * canonically ordered intent batch; the SDK never serially applies participant
 * commands. Config, state, observation, and command shapes are game-owned.
 */
export interface GameDefinition<TConfig, TState, TObservation, TCommand, TCommandDefinition = unknown> {
    id: string;
    version: string;
    create(config: TConfig, seed: number): TState;
    participants(state: TState): readonly string[];
    observe(state: TState, participantId: string): TObservation;
    /** Discoverable legal command surface for this participant and revision. */
    legalCommands(state: TState, participantId: string): readonly TCommandDefinition[];
    /** Authoritative host-side validation for an opaque submitted command. */
    isCommandLegal(state: TState, participantId: string, command: TCommand): boolean;
    /** One collected input batch resolves exactly one tick. */
    resolveTick(state: TState, intents: readonly CollectedIntent<TCommand>[]): TState;
}
/** Resolve one canonical simulation tick through either adapter generation. */
export declare function resolveGameTick<TState, TCommand>(definition: Pick<GameDefinition<unknown, TState, unknown, TCommand>, 'resolveTick'>, state: TState, intents: readonly CollectedIntent<TCommand>[]): TState;
/** Instance-local registry: hosts opt games in explicitly without global state. */
export declare class GameRegistry {
    private readonly definitions;
    register<TConfig, TState, TObservation, TCommand, TCommandDefinition>(definition: GameDefinition<TConfig, TState, TObservation, TCommand, TCommandDefinition>): void;
    get<TConfig, TState, TObservation, TCommand, TCommandDefinition = unknown>(id: string, version: string): GameDefinition<TConfig, TState, TObservation, TCommand, TCommandDefinition> | undefined;
}
/** Plain-JSON state suitable for Durable Object/database persistence. */
export interface IntentWindow<TCommand = unknown> extends TickCursor {
    sessionId: string;
    /** Canonical lexicographic order used for deterministic resolution. */
    participants: string[];
    intents: Record<string, CollectedIntent<TCommand>>;
}
/** Structural counterpart of the engine participation descriptor. */
export type IntentParticipation = {
    mode: 'sequential';
    activeSeat: string;
} | {
    mode: 'simultaneous';
    seats: readonly string[];
};
/**
 * Map one engine collection tick to the protocol's eligible participant set.
 * Sequential play creates a one-seat window; simultaneous play includes every
 * declared seat. Portable seat-id validation is delegated to the normal
 * intent-window constructor.
 */
export declare function createParticipationIntentWindow<TCommand>(sessionId: string, revision: number, participation: IntentParticipation): IntentWindow<TCommand>;
export type IntentCollectionResult<TCommand = unknown> = {
    status: 'pending';
    window: IntentWindow<TCommand>;
    submittedParticipants: string[];
    awaitingParticipants: string[];
} | {
    status: 'ready';
    window: IntentWindow<TCommand>;
    /** Always follows `window.participants`, never request arrival order. */
    intents: CollectedIntent<TCommand>[];
};
export type IntentErrorCode = 'invalid_protocol' | 'wrong_session' | 'stale_tick' | 'unknown_participant' | 'invalid_submission' | 'illegal_command' | 'conflicting_intent';
export declare class IntentCollectionError extends Error {
    readonly code: IntentErrorCode;
    readonly cause?: unknown | undefined;
    constructor(code: IntentErrorCode, message: string, cause?: unknown | undefined);
}
export declare function makeTickId(sessionId: string, revision: number): string;
export declare function createIntentWindow<TCommand>(sessionId: string, revision: number, participantIds: readonly string[]): IntentWindow<TCommand>;
/**
 * Add one intent without mutating the persisted input window. Exact retries
 * are idempotent; stale or conflicting submissions are explicit errors. A
 * ready result may be recomputed for an exact retry. The host must atomically
 * commit resolution, its retry receipt, and the next intent window to ensure
 * the reducer itself runs once.
 */
export declare function collectIntent<TCommand>(window: IntentWindow<TCommand>, submission: CommandSubmission<TCommand>): IntentCollectionResult<TCommand>;
/** Validate the stable wire cursor before interpreting a game-owned command. */
export declare function validateIntentSubmission<TCommand>(window: IntentWindow<unknown>, submission: CommandSubmission<TCommand>): void;
/** Reject values whose JSON serialization is lossy, ambiguous, or unsafe. */
export declare function assertJsonValue(value: unknown, label?: string): asserts value is JsonValue;
export declare function assertJsonObject(value: unknown, label?: string): asserts value is JsonObject;
/** Collision-free canonical JSON used for exact retry comparison. */
export declare function canonicalJson(value: unknown): string;
export declare function tickEnvelope<TObservation>(sessionId: string, revision: number, tick: TObservation, extensions?: ProtocolExtensions): TickEnvelope<TObservation>;
export declare function pendingEnvelope<TObservation, TCommand>(window: IntentWindow<TCommand>, tick: TObservation, acceptedParticipantId?: string, extensions?: ProtocolExtensions): PendingEnvelope<TObservation>;
export {};
