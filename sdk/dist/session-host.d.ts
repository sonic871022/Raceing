import { type JsonObject, type JsonValue } from './protocol.js';
import { type AdvanceSummary, type IngestReceipt, type InterestReceipt, type InterestSubmission, type ObservationDelta, type SeatSignatureInput, type SessionEvent, type SessionKernel, type TimeoutInput } from './session.js';
export interface SessionEventStore {
    /** Atomically persist the batch or prove that every event is an exact retry. */
    persist(events: readonly SessionEvent[]): Promise<void>;
    load(): Promise<readonly SessionEvent[]>;
}
export declare class InMemorySessionEventStore implements SessionEventStore {
    private readonly byId;
    private readonly order;
    persist(events: readonly SessionEvent[]): Promise<void>;
    load(): Promise<readonly SessionEvent[]>;
}
export type SessionObservationPublisher<TView> = (deltas: readonly ObservationDelta<TView>[]) => Promise<void>;
/**
 * Reference host lane implementing prepare → persist → commit → publish.
 * Publication failures remain queued and can be retried without rerunning the
 * reducer or rewriting durable history.
 */
export declare class SessionKernelHost<TCommand extends JsonValue, TView, TLevel = unknown> {
    private readonly kernel;
    private readonly store;
    private readonly publish;
    private lane;
    private readonly publicationQueue;
    constructor(kernel: SessionKernel<TCommand, TView, TLevel>, store: SessionEventStore, publish: SessionObservationPublisher<TView>);
    private enqueue;
    private flushPublicationQueue;
    ingest(submission: Parameters<SessionKernel<TCommand, TView>['prepareIngest']>[0]): Promise<IngestReceipt>;
    advance(target?: number): Promise<AdvanceSummary<TView>>;
    timeout(input: TimeoutInput, forcedInput?: Parameters<SessionKernel<TCommand, TView>['prepareTimeout']>[1]): Promise<AdvanceSummary<TView>>;
    extension(lane: string, record: JsonObject): Promise<void>;
    interest(submission: InterestSubmission): Promise<InterestReceipt>;
    seatSignature(input: SeatSignatureInput): Promise<void>;
    retryPublish(): Promise<void>;
    pendingPublicationBatches(): number;
}
export interface HostConformanceScenario {
    name: 'byte-identical retry' | 'conflicting event reuse' | 'atomic conflicting batch';
    passed: boolean;
}
/** Reusable transport-neutral event-store conformance checks. */
export declare function runEventStoreConformance(createStore: () => SessionEventStore): Promise<readonly HostConformanceScenario[]>;
