import { type JsonObject } from './protocol.js';
export declare const VERIFIER_KIT_SCHEMA: "gaos.verifier-kit.v1";
export declare const VERIFIER_REFERENCE_SCHEMA: "gaos.verifier-reference.v1";
export declare const VERIFIER_KIT_MEDIA_TYPE: "application/vnd.gaos.verifier-kit.v1+tar";
export declare const VERIFIER_KIT_EXTENSION: "gaos-verifier";
export interface VerifierKitManifestV1 {
    schema: typeof VERIFIER_KIT_SCHEMA;
    game: {
        id: string;
        version: string;
    };
    adapter: {
        id: string;
        version: string;
        entrypoint: 'adapter.bundle.mjs';
    };
    runtime: {
        kind: 'node-esm';
        gaosVersion: string;
        nodeRange: string;
    };
    replayFormats: string[];
    files: Array<{
        path: string;
        size: number;
        digest: `sha256:${string}`;
    }>;
}
export interface VerifierReferenceV1 {
    schema: typeof VERIFIER_REFERENCE_SCHEMA;
    digest: `sha256:${string}`;
    mediaType: typeof VERIFIER_KIT_MEDIA_TYPE;
    size: number;
    mirrors: string[];
}
export interface VerifierKitResolution {
    reference: 'absent' | 'present';
    retrieval: 'not_attempted' | 'cached' | 'fetched' | 'unavailable';
    integrity: 'unchecked' | 'matched' | 'mismatched';
    authorization: 'unknown' | 'accepted' | 'rejected';
    execution: 'not_run' | 'passed' | 'failed' | 'restricted';
    digest?: string;
    source?: string;
    diagnostics: string[];
}
export interface PackedVerifierKit {
    bytes: Uint8Array;
    digest: `sha256:${string}`;
    manifest: VerifierKitManifestV1;
}
export interface InspectedVerifierKit extends PackedVerifierKit {
    files: ReadonlyMap<string, Uint8Array>;
}
export interface VerifierKitLimits {
    maxBytes?: number;
    maxFiles?: number;
}
export interface PackVerifierKitInput {
    game: VerifierKitManifestV1['game'];
    adapter: Omit<VerifierKitManifestV1['adapter'], 'entrypoint'>;
    runtime: VerifierKitManifestV1['runtime'];
    replayFormats: string[];
    /** Complete, already bundled kit files. Must include adapter.bundle.mjs. */
    files: Readonly<Record<string, Uint8Array | string>>;
}
export interface ResolveVerifierKitOptions {
    reference?: VerifierReferenceV1;
    authorizedDigests?: ReadonlySet<string> | readonly string[];
    cacheDirectory: string;
    fetch?: (mirror: string) => Promise<Uint8Array>;
    limits?: VerifierKitLimits;
}
export interface RestrictedVerifierRequest {
    schema: 'gaos.verifier-request.v1';
    kitDigest: string;
    kitDirectory: string;
    replayPath: string;
}
export interface RestrictedVerifierResponse {
    schema: 'gaos.verifier-response.v1';
    verdict: 'trusted' | 'unverifiable' | 'rejected';
    diagnostics: string[];
}
/**
 * Security boundary supplied by the verifier operator (for example a pinned
 * container runner). GAOS never imports fetched adapter code in-process.
 */
export interface RestrictedVerifierRunner {
    run(request: RestrictedVerifierRequest, limits: {
        cpuMilliseconds: number;
        wallMilliseconds: number;
        memoryBytes: number;
        processes: number;
        outputBytes: number;
    }): Promise<RestrictedVerifierResponse>;
}
export declare function assertVerifierKitManifest(value: unknown): asserts value is VerifierKitManifestV1;
export declare function assertVerifierReference(value: unknown): asserts value is VerifierReferenceV1;
export declare function verifierReferenceFromExtensions(extensions: JsonObject | undefined): VerifierReferenceV1 | undefined;
export declare function packVerifierKit(input: PackVerifierKitInput): PackedVerifierKit;
export declare function inspectVerifierKit(input: Uint8Array, limits?: VerifierKitLimits): InspectedVerifierKit;
export declare function admitVerifierKit(cacheDirectory: string, bytes: Uint8Array, expectedDigest: string, limits?: VerifierKitLimits): Promise<string>;
export declare function readCachedVerifierKit(cacheDirectory: string, digest: string, limits?: VerifierKitLimits): Promise<InspectedVerifierKit | undefined>;
export declare function resolveVerifierKit(options: ResolveVerifierKitOptions): Promise<{
    resolution: VerifierKitResolution;
    kit?: InspectedVerifierKit;
}>;
export declare function extractVerifierKit(kit: InspectedVerifierKit, destination: string): Promise<void>;
export declare function runRestrictedVerifier(runner: RestrictedVerifierRunner | undefined, request: RestrictedVerifierRequest, limits?: Partial<Parameters<RestrictedVerifierRunner['run']>[1]>): Promise<{
    resolution: Pick<VerifierKitResolution, 'execution' | 'diagnostics'>;
    response?: RestrictedVerifierResponse;
}>;
