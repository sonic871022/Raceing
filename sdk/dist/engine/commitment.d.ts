import { type JsonValue } from '../protocol.js';
export declare const COMMITMENT_SCHEME: "gaos.commit.sha256.v1";
export declare const COMMITMENT_MAX_PAYLOAD_BYTES = 65536;
export declare const COMMITMENT_MAX_ID = 4294967295;
export interface CommitmentBinding {
    sessionId: string;
    seat: string;
    commitmentId: number;
    windowRef: number;
}
export interface CommitmentEnvelope {
    commitmentId: number;
    scheme: typeof COMMITMENT_SCHEME;
    hash: string;
}
export interface RevealEnvelope {
    commitmentId: number;
    salt: string;
    payload: JsonValue;
}
export type CommitmentVerificationCode = 'ok' | 'invalid_envelope' | 'commit_mismatch';
export interface CommitmentVerification {
    ok: boolean;
    code: CommitmentVerificationCode;
    expectedHash: string;
    actualHash: string;
}
/** Canonical payload bytes used by the v1 commitment scheme. */
export declare function canonicalCommitPayloadV1(payload: JsonValue): Uint8Array;
/** Build the complete, framed byte preimage pinned by gaos.commit.sha256.v1. */
export declare function commitmentPreimageV1(binding: CommitmentBinding, salt: string, payload: JsonValue): Uint8Array;
/** Hash bytes with the frozen synchronous SHA-256 implementation. */
export declare function sha256(bytes: Uint8Array): Uint8Array;
export declare function bytesToHex(bytes: Uint8Array): string;
/** Compute the wire hash for one commitment. */
export declare function createCommitmentHash(binding: CommitmentBinding, salt: string, payload: JsonValue): string;
export declare function assertCommitmentEnvelope(value: CommitmentEnvelope): void;
/** Verify one reveal against a recorded commitment and binding context. */
export declare function verifyCommitmentReveal(binding: CommitmentBinding, commitment: CommitmentEnvelope, reveal: RevealEnvelope): CommitmentVerification;
