import { bytesToHex, sha256 } from './engine/commitment.js';
/** Storage-neutral metadata API used by the deployable starter. */
export class LeaderboardService {
    objects;
    queue;
    entries = new Map();
    constructor(objects, queue) {
        this.objects = objects;
        this.queue = queue;
    }
    async submit(entry, bundle) {
        if (entry.schema !== 'gaos.leaderboard-entry.v2') {
            throw new TypeError('leaderboard submission requires the V2 schema');
        }
        assertIndependentVerificationFacts(entry.verification);
        if (entry.artifactDigest !== bytesToHex(sha256(bundle))) {
            throw new TypeError('artifact digest does not match submitted bundle bytes');
        }
        if (this.entries.has(entry.submissionId)) {
            throw new TypeError(`duplicate leaderboard submission ${entry.submissionId}`);
        }
        await this.objects.put(entry.artifactDigest, bundle.slice());
        this.entries.set(entry.submissionId, {
            ...structuredClone(entry),
            evidenceVerdict: 'unverifiable',
            reproduced: false,
            verification: pendingVerificationFacts(),
            eligibility: undefined,
        });
        await this.queue.enqueue(entry.submissionId, entry.artifactDigest);
    }
    list(query = {}) {
        return [...this.entries.values()]
            .filter((entry) => (query.benchmarkId === undefined || entry.benchmarkId === query.benchmarkId)
            && (query.benchmarkVersion === undefined
                || entry.benchmarkVersion === query.benchmarkVersion)
            && (query.modality === undefined || entry.modality === query.modality))
            .sort((left, right) => right.aggregateScore - left.aggregateScore
            || left.submissionId.localeCompare(right.submissionId))
            .map((entry) => structuredClone(entry));
    }
    metadata(submissionId) {
        const entry = this.entries.get(submissionId);
        if (entry === undefined)
            return undefined;
        return {
            entry: structuredClone(entry),
            artifactDownload: `/api/submissions/${encodeURIComponent(submissionId)}/artifact`,
            localVerification: `gaos benchmark verify ${entry.artifactDigest}.gaos-bench`,
        };
    }
    async artifact(submissionId) {
        const entry = this.entries.get(submissionId);
        if (entry === undefined)
            return undefined;
        return (await this.objects.get(entry.artifactDigest))?.slice();
    }
}
function pendingVerificationFacts() {
    return {
        replay: 'not-observed', signatures: 'not-observed', semantics: 'not-observed',
        evidenceComplete: 'not-observed', organizerReproduced: 'not-observed',
        implementationOpen: 'not-observed', modelIdentityAttested: 'not-observed',
        hiddenTestCompliant: 'not-observed', accountIdentityAttested: 'not-observed',
        timeAttested: 'not-observed', publicationLogged: 'not-observed',
        tailAnchored: 'not-observed', availabilityObserved: 'not-observed',
        externalAuthorities: [], reasons: ['pending independent verification'],
    };
}
export function assertIndependentVerificationFacts(facts) {
    const required = [
        'replay',
        'signatures',
        'semantics',
        'evidenceComplete',
        'organizerReproduced',
        'implementationOpen',
        'modelIdentityAttested',
        'hiddenTestCompliant',
        'accountIdentityAttested',
        'timeAttested',
        'publicationLogged',
        'tailAnchored',
        'availabilityObserved',
    ];
    for (const field of required) {
        if (!['verified', 'unverified', 'failed', 'not-required', 'not-observed'].includes(facts[field])) {
            throw new TypeError(`invalid independent verification fact ${field}`);
        }
    }
    if (!Array.isArray(facts.externalAuthorities) || !Array.isArray(facts.reasons)) {
        throw new TypeError('verification facts require authority results and reasons');
    }
}
