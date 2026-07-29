import { type JsonValue } from './protocol.js';
import type { ExternalAttestation, ExternalTrustResolver, ExternalTrustResult } from './evidence.js';
export interface BenchmarkIdentity {
    id: string;
    version: string;
    adapter: string;
}
export interface BenchmarkTask {
    id: string;
    seeds: readonly number[];
    episodes: number;
    maxSteps: number;
    weight?: number;
}
export interface BenchmarkScoring {
    plugin: string;
    aggregation: 'mean' | 'weighted-mean' | 'sum';
}
export interface BenchmarkSubmissionPolicy {
    requireSignedSeats: boolean;
    requireCompleteCoverage: boolean;
}
export interface BenchmarkAuthorityRequirement {
    claim: 'identity' | 'time' | 'publication' | 'tail-anchor' | 'model-identity' | 'hidden-test';
    purpose: 'identity' | 'timestamp' | 'transparency' | 'witness';
    authorityId: string;
    keyIds?: string[];
    pinnedRootDigests?: string[];
    acceptedSchemas: string[];
    acceptedAlgorithms?: string[];
    revocationPolicy?: 'ignore' | 'reject-revoked' | 'require-valid';
    required: boolean;
}
export interface BenchmarkManifest {
    schema: 'gaos.benchmark-manifest';
    schemaVersion: '1.0';
    benchmark: BenchmarkIdentity;
    tasks: readonly BenchmarkTask[];
    scoring: BenchmarkScoring;
    submission: BenchmarkSubmissionPolicy;
    observationModalities?: readonly string[];
    agentInterface?: string;
    authorityRequirements?: readonly BenchmarkAuthorityRequirement[];
}
export interface BenchmarkEpisodePlan {
    index: number;
    taskId: string;
    seed: number;
    episode: number;
    maxSteps: number;
}
export interface BenchmarkTaskScore {
    taskId: string;
    score: number;
}
export interface BenchmarkAggregate {
    aggregateScore: number;
    taskScores: Readonly<Record<string, number>>;
}
export interface EvidenceTrustClaims {
    evidenceVerified: boolean;
    organizerReproduced: boolean;
    openImplementation: boolean;
    modelIdentityAttested: boolean;
    hiddenTestCompliant: boolean;
}
export interface LeaderboardEntry {
    benchmarkId: string;
    benchmarkVersion: string;
    submissionId: string;
    agentName: string;
    modelClaim?: string;
    strategyName?: string;
    modality: string;
    aggregateScore: number;
    taskScores: Record<string, number>;
    uncertainty?: number;
    artifactDigest: string;
    evidenceVerdict: 'trusted' | 'unverifiable' | 'rejected';
    reproduced: boolean;
    openSourceUrl?: string;
}
export type VerificationState = 'verified' | 'unverified' | 'failed' | 'not-required' | 'not-observed';
export interface SubmissionVerificationFacts {
    replay: VerificationState;
    signatures: VerificationState;
    semantics: VerificationState;
    evidenceComplete: VerificationState;
    organizerReproduced: VerificationState;
    implementationOpen: VerificationState;
    modelIdentityAttested: VerificationState;
    hiddenTestCompliant: VerificationState;
    accountIdentityAttested: VerificationState;
    timeAttested: VerificationState;
    publicationLogged: VerificationState;
    tailAnchored: VerificationState;
    availabilityObserved: VerificationState;
    externalAuthorities: ExternalTrustResult[];
    reasons: string[];
}
export interface LeaderboardEntryV2 extends LeaderboardEntry {
    schema: 'gaos.leaderboard-entry.v2';
    verification: SubmissionVerificationFacts;
    eligibility?: {
        policyId: string;
        policyVersion: string;
        decision: 'eligible' | 'ineligible' | 'pending';
        reasons: string[];
    };
}
export type BenchmarkAgentKind = 'local' | 'provider' | 'cli';
export interface BenchmarkResourceObservations {
    steps: number;
    wallClockMs?: number;
    tokens?: number;
    cost?: number;
    provider?: string;
}
export interface BenchmarkEpisodeResult {
    plan: BenchmarkEpisodePlan;
    score: number;
    replay: JsonValue;
    terminalOutcome: JsonValue;
    observations: BenchmarkResourceObservations;
}
export interface BenchmarkAgentAdapter {
    kind: BenchmarkAgentKind;
    id: string;
    runEpisode(plan: BenchmarkEpisodePlan): Promise<BenchmarkEpisodeResult>;
}
export interface BenchmarkRunCheckpoint {
    schema: 'gaos.benchmark-run-checkpoint.v1';
    manifestDigest: string;
    agent: {
        kind: BenchmarkAgentKind;
        id: string;
    };
    plan: readonly BenchmarkEpisodePlan[];
    completed: readonly BenchmarkEpisodeResult[];
}
export interface BenchmarkRun {
    status: 'complete' | 'interrupted';
    checkpoint: BenchmarkRunCheckpoint;
    aggregate?: BenchmarkAggregate;
}
export interface BenchmarkBundleEpisode {
    id: string;
    plan: BenchmarkEpisodePlan;
    replay: JsonValue;
    terminalOutcome: JsonValue;
    score: number;
    replayDigest: string;
}
export interface BenchmarkBundle {
    schema: 'gaos.benchmark-bundle.v1';
    /** Digest of all authoritative contents, excluding attestations and this field. */
    contentDigest: string;
    manifest: BenchmarkManifest;
    manifestDigest: string;
    submission: {
        submissionId: string;
        agentId: string;
        agentKind: BenchmarkAgentKind;
        attestations?: readonly ExternalAttestation[];
    };
    episodes: readonly BenchmarkBundleEpisode[];
    scores: BenchmarkAggregate;
}
export interface BenchmarkBundleVerification {
    valid: boolean;
    bundleDigest: string;
    aggregate?: BenchmarkAggregate;
    episodeFacts: readonly {
        id: string;
        replayValid: boolean;
        score: number;
        terminalOutcome: JsonValue;
        signatures: VerificationState;
        semantics: VerificationState;
        evidenceComplete: VerificationState;
        reasons: string[];
    }[];
    facts: SubmissionVerificationFacts;
}
export interface BenchmarkEpisodeVerification {
    replayValid: boolean;
    score: number;
    terminalOutcome: JsonValue;
    signatures: VerificationState;
    semantics: VerificationState;
    evidenceComplete: VerificationState;
    reasons?: string[];
}
export interface BenchmarkVerificationOptions {
    externalTrustResolver?: ExternalTrustResolver;
}
export interface BenchmarkPackage {
    bundle: BenchmarkBundle;
    files: Readonly<Record<string, string>>;
    digest: string;
}
/** Validate only neutral execution structure; benchmark meaning stays product-owned. */
export declare function assertBenchmarkManifest(manifest: BenchmarkManifest): asserts manifest is BenchmarkManifest;
export declare function benchmarkManifestDigest(manifest: BenchmarkManifest): string;
/**
 * Execute the authored plan with bounded concurrency. Results and checkpoints
 * are always canonical plan order, so parallelism and resume cannot affect
 * episode identities or scores.
 */
export declare function runBenchmark(manifest: BenchmarkManifest, adapter: BenchmarkAgentAdapter, options?: {
    parallelism?: number;
    resume?: BenchmarkRunCheckpoint;
    maxNewEpisodes?: number;
}): Promise<BenchmarkRun>;
/** Reproducibly package a complete run in authored episode order. */
export declare function packBenchmarkRun(manifest: BenchmarkManifest, run: BenchmarkRun, submission: BenchmarkBundle['submission']): BenchmarkPackage;
/** Stable digest signed by external attestations; attestations cannot self-bind. */
export declare function benchmarkBundleContentDigest(bundle: BenchmarkBundle): string;
/** Attach receipts only after their subject is the already-computed content digest. */
export declare function attachBenchmarkAttestations(bundle: BenchmarkBundle, attestations: readonly ExternalAttestation[]): BenchmarkBundle;
export declare function emptyVerificationFacts(): SubmissionVerificationFacts;
/** Exact, portable `.gaos-bench` directory contents from RFC-015 §4. */
export declare function benchmarkBundleFiles(bundle: BenchmarkBundle, verification?: SubmissionVerificationFacts): Readonly<Record<string, string>>;
/** Hash sorted path/length/content tuples, independent of traversal metadata. */
export declare function benchmarkPackageDigest(files: Readonly<Record<string, string>>): string;
/**
 * Verify a portable bundle against an independently supplied manifest.
 * Carried episode and aggregate scores are comparison data, never authority.
 */
export declare function verifyBenchmarkBundle(bundle: BenchmarkBundle, manifest: BenchmarkManifest, verifyEpisode: (episode: BenchmarkBundleEpisode) => Promise<BenchmarkEpisodeVerification>, options?: BenchmarkVerificationOptions): Promise<BenchmarkBundleVerification>;
/** Task order, then authored seed order, then episode ordinal. */
export declare function planBenchmarkEpisodes(manifest: BenchmarkManifest): readonly BenchmarkEpisodePlan[];
/** Recompute an aggregate only from one finite score for every manifest task. */
export declare function aggregateBenchmarkScores(manifest: BenchmarkManifest, scores: readonly BenchmarkTaskScore[]): BenchmarkAggregate;
