import { type JsonValue } from './protocol.js';
import type { ObservationDelta, SnapshotResult } from './session.js';
export declare const RFC013_HOST_CONFORMANCE_SCENARIOS: readonly ["byte-identical retry", "conflicting event reuse", "crash before persistence", "crash after persistence", "crash after commit", "publish retry after durable commit", "stale prepared transition rejection", "timeout transition handling", "acknowledgement and rejection", "reconnect repair", "patch without base snapshot", "dropout and drop-in", "reconnect and substitution", "transfer and atomic seat swap", "inactive controller epoch rejection", "checkpoint restore and retention floor", "artifact finalization and independent verification"];
export type Rfc013HostConformanceScenario = typeof RFC013_HOST_CONFORMANCE_SCENARIOS[number];
export declare const HOST_CONFORMANCE_VERSION: "gaos.host-conformance.v1";
export declare const HOST_CONFORMANCE_FIXTURE_VERSION: "gaos.host-conformance-fixture.v1";
export declare const RFC014_HOST_CONFORMANCE_SCENARIOS: readonly ["byte-identical retry", "conflicting event reuse", "crash before persistence", "crash after persistence", "crash after commit", "publish retry after durable commit", "stale prepared transition rejection", "timeout transition handling", "acknowledgement and rejection", "reconnect repair", "patch without base snapshot", "dropout and drop-in", "reconnect and substitution", "transfer and atomic seat swap", "inactive controller epoch rejection", "checkpoint restore and retention floor", "artifact finalization and independent verification"];
export interface HostConformanceFixture {
    schema: typeof HOST_CONFORMANCE_FIXTURE_VERSION;
    scenario: Rfc013HostConformanceScenario;
    steps: readonly {
        sequence: number;
        operation: string;
    }[];
}
export declare const RFC014_HOST_CONFORMANCE_FIXTURES: readonly HostConformanceFixture[];
export interface HostConformanceAdapter {
    runtime: string;
    adapterVersion: string;
    execute(fixture: HostConformanceFixture): Promise<JsonValue>;
}
export interface HostConformanceReport {
    schema: typeof HOST_CONFORMANCE_VERSION;
    runtime: string;
    adapterVersion: string;
    passed: boolean;
    scenarios: readonly {
        scenario: Rfc013HostConformanceScenario;
        passed: boolean;
        details?: JsonValue;
    }[];
}
/** Execute the transport-neutral fixture names and emit portable result facts. */
export declare function runHostConformance(adapter: HostConformanceAdapter, fixtures?: readonly HostConformanceFixture[]): Promise<HostConformanceReport>;
/**
 * Executable reference fixtures. Each scenario performs state transitions and
 * fault injection; a report cannot be made green by returning caller-authored
 * booleans.
 */
export declare function runReferenceHostConformance(): Promise<HostConformanceReport>;
export interface PresentationFrame<TView, TEvent> {
    tick: number;
    transitionRevision: number;
    view: TView;
    events: readonly TEvent[];
    stateDigest?: string;
    repair?: boolean;
}
export interface HostCreateInput {
    sessionId: string;
    [key: string]: unknown;
}
export interface HostSeatControl {
    changes: readonly unknown[];
    authorization: unknown;
}
export interface HostSubmission<TCommand> {
    command: TCommand;
    [key: string]: unknown;
}
export interface HostObservation<TView> {
    observation: SnapshotResult<TView>;
}
export interface HostArtifact {
    format: string;
    artifact: JsonValue;
}
export interface HostedSession<TCommand, TView> {
    sessionId: string;
    ingest(input: HostSubmission<TCommand>): Promise<void>;
    snapshot(seat: string, afterRevision?: number): Promise<HostObservation<TView>>;
}
/**
 * Transport-neutral lifecycle boundary. Authentication, sockets, storage,
 * matchmaking, and publication remain host responsibilities.
 */
export interface SessionHostDriver<TCommand, TView> {
    create(input: HostCreateInput): Promise<HostedSession<TCommand, TView>>;
    control(sessionId: string, input: HostSeatControl): Promise<void>;
    ingest(sessionId: string, input: HostSubmission<TCommand>): Promise<void>;
    advance(sessionId: string, tick: number): Promise<void>;
    snapshot(sessionId: string, seat: string, afterRevision?: number): Promise<HostObservation<TView>>;
    terminate(sessionId: string, reason: string): Promise<HostArtifact>;
}
export interface PresentationEvent {
    /** Stable across retry and reconnect; clients deduplicate on this field. */
    id: string;
    type: string;
    [key: string]: unknown;
}
/**
 * Project one seat-scoped durable observation into a rendering boundary.
 * Repair frames deliberately carry no old cues.
 */
export declare function presentationFrameFromObservation<TView, TEvent extends PresentationEvent>(delta: ObservationDelta<TView>, view: TView, events: readonly TEvent[], options?: {
    stateDigest?: string;
    repair?: boolean;
}): PresentationFrame<TView, TEvent>;
