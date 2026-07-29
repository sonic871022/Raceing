import { canonicalJson } from './protocol.js';
import { SessionConflictError, } from './session.js';
export class InMemorySessionEventStore {
    byId = new Map();
    order = [];
    async persist(events) {
        const incoming = events.map((event) => ({
            event,
            canonical: canonicalJson(event),
        }));
        for (const { event, canonical } of incoming) {
            const existing = this.byId.get(event.eventId);
            if (existing !== undefined && existing.canonical !== canonical) {
                throw new SessionConflictError(`eventId ${event.eventId} was reused with different canonical bytes`);
            }
        }
        for (const { event, canonical } of incoming) {
            if (this.byId.has(event.eventId))
                continue;
            this.byId.set(event.eventId, {
                canonical,
                event: structuredClone(event),
            });
            this.order.push(event.eventId);
        }
    }
    async load() {
        return this.order.map((id) => structuredClone(this.byId.get(id).event));
    }
}
/**
 * Reference host lane implementing prepare → persist → commit → publish.
 * Publication failures remain queued and can be retried without rerunning the
 * reducer or rewriting durable history.
 */
export class SessionKernelHost {
    kernel;
    store;
    publish;
    lane = Promise.resolve();
    publicationQueue = [];
    constructor(kernel, store, publish) {
        this.kernel = kernel;
        this.store = store;
        this.publish = publish;
    }
    enqueue(prepare) {
        const operation = this.lane.then(async () => {
            await this.flushPublicationQueue();
            const prepared = prepare();
            try {
                await this.store.persist(prepared.events);
            }
            catch (error) {
                this.kernel.abort(prepared);
                throw error;
            }
            this.kernel.commit(prepared);
            if (prepared.deltas.length > 0) {
                this.publicationQueue.push(structuredClone(prepared.deltas));
            }
            await this.flushPublicationQueue();
            return prepared.result;
        });
        this.lane = operation.then(() => undefined, () => undefined);
        return operation;
    }
    async flushPublicationQueue() {
        while (this.publicationQueue.length > 0) {
            const batch = this.publicationQueue[0];
            await this.publish(structuredClone(batch));
            this.publicationQueue.shift();
        }
    }
    ingest(submission) {
        return this.enqueue(() => this.kernel.prepareIngest(submission));
    }
    advance(target) {
        return this.enqueue(() => this.kernel.prepareAdvance(target));
    }
    timeout(input, forcedInput) {
        return this.enqueue(() => this.kernel.prepareTimeout(input, forcedInput));
    }
    extension(lane, record) {
        return this.enqueue(() => this.kernel.prepareExtension(lane, record));
    }
    interest(submission) {
        return this.enqueue(() => this.kernel.prepareInterest(submission));
    }
    seatSignature(input) {
        return this.enqueue(() => this.kernel.prepareSeatSignature(input));
    }
    retryPublish() {
        const operation = this.lane.then(() => this.flushPublicationQueue());
        this.lane = operation.then(() => undefined, () => undefined);
        return operation;
    }
    pendingPublicationBatches() {
        return this.publicationQueue.length;
    }
}
/** Reusable transport-neutral event-store conformance checks. */
export async function runEventStoreConformance(createStore) {
    const event = {
        kind: 'extension',
        eventId: 'conformance:1:0',
        transitionRevision: 1,
        tick: 0,
        lane: 'conformance',
        record: { value: 1 },
    };
    const retryStore = createStore();
    await retryStore.persist([event]);
    await retryStore.persist([structuredClone(event)]);
    const retryPassed = (await retryStore.load()).length === 1;
    const conflictStore = createStore();
    await conflictStore.persist([event]);
    let conflictPassed = false;
    try {
        await conflictStore.persist([{
                ...event,
                record: { value: 2 },
            }]);
    }
    catch (error) {
        conflictPassed = error instanceof SessionConflictError;
    }
    const atomicStore = createStore();
    await atomicStore.persist([event]);
    let atomicPassed = false;
    try {
        await atomicStore.persist([
            {
                ...event,
                eventId: 'conformance:2:0',
                transitionRevision: 2,
            },
            {
                ...event,
                record: { value: 2 },
            },
        ]);
    }
    catch (error) {
        atomicPassed = error instanceof SessionConflictError
            && (await atomicStore.load()).length === 1;
    }
    return [
        { name: 'byte-identical retry', passed: retryPassed },
        { name: 'conflicting event reuse', passed: conflictPassed },
        { name: 'atomic conflicting batch', passed: atomicPassed },
    ];
}
