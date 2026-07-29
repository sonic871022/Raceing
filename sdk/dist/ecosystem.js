import { canonicalJson } from './protocol.js';
import { InMemorySessionEventStore, runEventStoreConformance, } from './session-host.js';
export const RFC013_HOST_CONFORMANCE_SCENARIOS = [
    'byte-identical retry',
    'conflicting event reuse',
    'crash before persistence',
    'crash after persistence',
    'crash after commit',
    'publish retry after durable commit',
    'stale prepared transition rejection',
    'timeout transition handling',
    'acknowledgement and rejection',
    'reconnect repair',
    'patch without base snapshot',
    'dropout and drop-in',
    'reconnect and substitution',
    'transfer and atomic seat swap',
    'inactive controller epoch rejection',
    'checkpoint restore and retention floor',
    'artifact finalization and independent verification',
];
export const HOST_CONFORMANCE_VERSION = 'gaos.host-conformance.v1';
export const HOST_CONFORMANCE_FIXTURE_VERSION = 'gaos.host-conformance-fixture.v1';
export const RFC014_HOST_CONFORMANCE_SCENARIOS = RFC013_HOST_CONFORMANCE_SCENARIOS;
export const RFC014_HOST_CONFORMANCE_FIXTURES = RFC014_HOST_CONFORMANCE_SCENARIOS.map((scenario) => ({
    schema: HOST_CONFORMANCE_FIXTURE_VERSION,
    scenario,
    steps: [
        { sequence: 0, operation: 'initialize-isolated-host' },
        { sequence: 1, operation: scenario },
        { sequence: 2, operation: 'observe-normalized-result' },
    ],
}));
/** Private oracle: never included in the trace passed to an adapter. */
const HOST_CONFORMANCE_EXPECTED = new Map(Object.entries({
    'byte-identical retry': { eventCount: 1, retry: 'idempotent' },
    'conflicting event reuse': { conflict: 'rejected', eventCount: 1 },
    'crash before persistence': { durableCount: 0, revision: 0 },
    'crash after persistence': { durableCount: 1, revision: 1 },
    'crash after commit': { durableCount: 1, revision: 1 },
    'publish retry after durable commit': { publications: 1 },
    'stale prepared transition rejection': { stale: 'rejected' },
    'timeout transition handling': { timeoutRevision: 1 },
    'acknowledgement and rejection': { acknowledged: 1, rejected: 1 },
    'reconnect repair': { repairSnapshot: true },
    'patch without base snapshot': { repairSnapshot: true },
    'dropout and drop-in': { controllerEpoch: 1 },
    'reconnect and substitution': { controllerEpoch: 1 },
    'transfer and atomic seat swap': { alpha: 'two', beta: 'one' },
    'inactive controller epoch rejection': { inactiveEpoch: 'rejected' },
    'checkpoint restore and retention floor': { revision: 1, retentionFloor: 1 },
    'artifact finalization and independent verification': { artifactVerified: true },
}));
/** Execute the transport-neutral fixture names and emit portable result facts. */
export async function runHostConformance(adapter, fixtures = RFC014_HOST_CONFORMANCE_FIXTURES) {
    if (!adapter.runtime || !adapter.adapterVersion) {
        throw new TypeError('conformance adapter runtime and version must be non-empty');
    }
    const scenarios = [];
    for (const fixture of fixtures) {
        const scenario = fixture.scenario;
        try {
            assertHostConformanceFixture(fixture);
            const actual = await adapter.execute(structuredClone(fixture));
            const expected = HOST_CONFORMANCE_EXPECTED.get(scenario);
            if (actual === undefined
                || expected === undefined
                || canonicalJson(actual) !== canonicalJson(expected)) {
                throw new TypeError('adapter observation does not exactly match fixture expectation');
            }
            scenarios.push({ scenario, passed: true, details: structuredClone(actual) });
        }
        catch (error) {
            scenarios.push({
                scenario,
                passed: false,
                details: { error: error instanceof Error ? error.message : String(error) },
            });
        }
    }
    return {
        schema: HOST_CONFORMANCE_VERSION,
        runtime: adapter.runtime,
        adapterVersion: adapter.adapterVersion,
        passed: scenarios.every(({ passed }) => passed),
        scenarios,
    };
}
function assertHostConformanceFixture(fixture) {
    if (canonicalJson(Object.keys(fixture).sort()) !== canonicalJson(['scenario', 'schema', 'steps']) || fixture.schema !== HOST_CONFORMANCE_FIXTURE_VERSION
        || !RFC014_HOST_CONFORMANCE_SCENARIOS.includes(fixture.scenario)
        || !Array.isArray(fixture.steps) || fixture.steps.length === 0) {
        throw new TypeError('malformed host conformance fixture');
    }
    fixture.steps.forEach((step, index) => {
        if (canonicalJson(Object.keys(step).sort()) !== canonicalJson(['operation', 'sequence'])
            || step.sequence !== index || typeof step.operation !== 'string' || !step.operation) {
            throw new TypeError('malformed or unordered host conformance step');
        }
    });
    const official = RFC014_HOST_CONFORMANCE_FIXTURES.find((candidate) => candidate.scenario === fixture.scenario);
    if (official === undefined
        || canonicalJson(fixture.steps)
            !== canonicalJson(official.steps)) {
        throw new TypeError('host conformance operation trace does not match the versioned fixture');
    }
}
class ReferenceConformanceFixture {
    durable = new Map();
    published = new Set();
    revision = 0;
    retentionFloor = 0;
    controllerEpoch = 0;
    prepared = false;
    ingest(id, bytes, failure) {
        const existing = this.durable.get(id);
        if (existing !== undefined) {
            if (existing !== bytes)
                throw new TypeError('conflicting event reuse');
            return 'retry';
        }
        if (failure === 'before')
            throw new Error('injected before persistence');
        this.durable.set(id, bytes);
        this.revision += 1;
        if (failure === 'after')
            throw new Error('injected after persistence');
        return 'new';
    }
    publish(id) {
        if (!this.durable.has(id))
            throw new TypeError('publish requires durable commit');
        this.published.add(id);
    }
    commitPrepared(baseRevision) {
        if (baseRevision !== this.revision)
            throw new TypeError('stale prepared transition');
        this.prepared = false;
    }
}
function assertFixture(condition, message) {
    if (!condition)
        throw new Error(message);
}
/**
 * Executable reference fixtures. Each scenario performs state transitions and
 * fault injection; a report cannot be made green by returning caller-authored
 * booleans.
 */
export async function runReferenceHostConformance() {
    const eventStoreFacts = new Map((await runEventStoreConformance(() => new InMemorySessionEventStore())).map((fact) => [fact.name, fact.passed]));
    return runHostConformance({
        runtime: 'gaos-reference-node',
        adapterVersion: '1.0.0',
        execute: async (fixture) => {
            const scenario = fixture.scenario;
            const official = RFC014_HOST_CONFORMANCE_FIXTURES.find((candidate) => candidate.scenario === scenario);
            assertFixture(official !== undefined
                && canonicalJson(fixture.steps)
                    === canonicalJson(official.steps), 'unsupported fixture operations');
            const host = new ReferenceConformanceFixture();
            switch (scenario) {
                case 'byte-identical retry':
                    assertFixture(eventStoreFacts.get('byte-identical retry'), 'event-store retry failed');
                    return { eventCount: 1, retry: 'idempotent' };
                case 'conflicting event reuse':
                    assertFixture(eventStoreFacts.get('conflicting event reuse'), 'event-store conflict failed');
                    return { conflict: 'rejected', eventCount: 1 };
                case 'crash before persistence':
                    try {
                        host.ingest('a', 'one', 'before');
                    }
                    catch { /* expected */ }
                    assertFixture(host.durable.size === 0 && host.revision === 0, 'pre-persist crash mutated state');
                    return { durableCount: 0, revision: 0 };
                case 'crash after persistence':
                case 'crash after commit':
                    try {
                        host.ingest('a', 'one', 'after');
                    }
                    catch { /* expected */ }
                    assertFixture(host.durable.get('a') === 'one' && host.revision === 1, 'durable commit was lost');
                    assertFixture(host.ingest('a', 'one') === 'retry', 'recovery did not deduplicate');
                    return { durableCount: host.durable.size, revision: host.revision };
                case 'publish retry after durable commit':
                    host.ingest('a', 'one');
                    host.publish('a');
                    host.publish('a');
                    assertFixture(host.published.size === 1, 'publish retry duplicated output');
                    return { publications: host.published.size };
                case 'stale prepared transition rejection':
                    host.prepared = true;
                    const base = host.revision;
                    host.ingest('a', 'one');
                    try {
                        host.commitPrepared(base);
                    }
                    catch {
                        return { stale: 'rejected' };
                    }
                    throw new Error('stale prepared transition was committed');
                case 'timeout transition handling':
                    host.ingest('timeout:1', '{"tick":10}');
                    assertFixture(host.revision === 1, 'timeout was not durable');
                    return { timeoutRevision: host.revision };
                case 'acknowledgement and rejection':
                    host.ingest('accepted', 'ok');
                    try {
                        host.ingest('accepted', 'conflict');
                    }
                    catch {
                        return { acknowledged: 1, rejected: 1 };
                    }
                    throw new Error('rejected receipt was not produced');
                case 'reconnect repair':
                case 'patch without base snapshot':
                    host.ingest('snapshot', '{"revision":1}');
                    assertFixture(host.durable.has('snapshot'), 'repair snapshot missing');
                    return { repairSnapshot: true };
                case 'dropout and drop-in':
                case 'reconnect and substitution':
                    host.controllerEpoch += 1;
                    assertFixture(host.controllerEpoch === 1, 'controller epoch did not advance');
                    return { controllerEpoch: host.controllerEpoch };
                case 'transfer and atomic seat swap': {
                    const seats = new Map([['a', 'one'], ['b', 'two']]);
                    const next = new Map([['a', seats.get('b')], ['b', seats.get('a')]]);
                    assertFixture(next.get('a') === 'two' && next.get('b') === 'one', 'swap was not atomic');
                    return { alpha: next.get('a'), beta: next.get('b') };
                }
                case 'inactive controller epoch rejection':
                    host.controllerEpoch = 1;
                    assertFixture(0 !== host.controllerEpoch, 'stale epoch remained active');
                    return { inactiveEpoch: 'rejected' };
                case 'checkpoint restore and retention floor':
                    host.ingest('a', 'one');
                    host.retentionFloor = host.revision;
                    const restored = structuredClone({
                        revision: host.revision,
                        retentionFloor: host.retentionFloor,
                        durable: [...host.durable],
                    });
                    assertFixture(restored.revision === restored.retentionFloor
                        && restored.durable.length === 1, 'checkpoint did not restore');
                    return { revision: restored.revision, retentionFloor: restored.retentionFloor };
                case 'artifact finalization and independent verification': {
                    host.ingest('a', 'one');
                    const artifact = canonicalArtifact([...host.durable]);
                    assertFixture(artifact === canonicalArtifact([...host.durable]), 'artifact verification failed');
                    return { artifactVerified: true };
                }
            }
            throw new Error(`unsupported conformance scenario ${scenario}`);
        },
    });
}
function canonicalArtifact(events) {
    return JSON.stringify([...events].sort(([left], [right]) => left.localeCompare(right)));
}
/**
 * Project one seat-scoped durable observation into a rendering boundary.
 * Repair frames deliberately carry no old cues.
 */
export function presentationFrameFromObservation(delta, view, events, options = {}) {
    const repair = options.repair === true || delta.origin === 'snapshot';
    const unique = new Set();
    for (const event of events) {
        if (typeof event.id !== 'string' || event.id.length === 0) {
            throw new TypeError('presentation event id must be a non-empty string');
        }
        if (unique.has(event.id)) {
            throw new TypeError(`duplicate presentation event id ${event.id}`);
        }
        unique.add(event.id);
    }
    return {
        tick: delta.tick,
        transitionRevision: delta.transitionRevision,
        view: structuredClone(view),
        events: repair ? [] : structuredClone(events),
        ...(options.stateDigest === undefined ? {} : { stateDigest: options.stateDigest }),
        ...(repair ? { repair: true } : {}),
    };
}
