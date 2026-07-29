import type { LeaderboardEntryV2, SubmissionVerificationFacts } from './benchmark.js';
export interface LeaderboardObjectStore {
    put(digest: string, bytes: Uint8Array): Promise<void>;
    get(digest: string): Promise<Uint8Array | undefined>;
}
export interface LeaderboardVerifierQueue {
    enqueue(submissionId: string, artifactDigest: string): Promise<void>;
}
export interface LeaderboardQuery {
    benchmarkId?: string;
    benchmarkVersion?: string;
    modality?: string;
}
export interface LeaderboardSubmissionMetadata {
    entry: LeaderboardEntryV2;
    artifactDownload: string;
    localVerification: string;
}
/** Storage-neutral metadata API used by the deployable starter. */
export declare class LeaderboardService {
    private readonly objects;
    private readonly queue;
    private readonly entries;
    constructor(objects: LeaderboardObjectStore, queue: LeaderboardVerifierQueue);
    submit(entry: LeaderboardEntryV2, bundle: Uint8Array): Promise<void>;
    list(query?: LeaderboardQuery): readonly LeaderboardEntryV2[];
    metadata(submissionId: string): LeaderboardSubmissionMetadata | undefined;
    artifact(submissionId: string): Promise<Uint8Array | undefined>;
}
export declare function assertIndependentVerificationFacts(facts: SubmissionVerificationFacts): void;
