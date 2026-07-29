import { type JsonValue } from '../protocol.js';
export declare const SUBMISSION_SIGNATURE_SCHEME: "gaos.submission.ed25519.v1";
export declare const SUBMISSION_SIGNATURE_ALGORITHM: "Ed25519";
export interface SubmissionSigningTier {
    /** Maximum tick gap between periodic chain-head signatures. */
    N: number;
}
export interface SubmissionSeatKey {
    id: string;
    publicKey: string;
    alg: typeof SUBMISSION_SIGNATURE_ALGORITHM;
    signingTier: SubmissionSigningTier;
}
export interface SubmissionSignaturePolicy {
    scheme: typeof SUBMISSION_SIGNATURE_SCHEME;
}
export interface SubmissionSigningEnvelope {
    sessionId: string;
    seat: string;
    submissionId: string;
    cursor: number;
    tick: number;
    clientTime: number;
    command: JsonValue;
    /** Canonical base64 SHA-256 chain link. */
    prevChainHash: string;
}
export interface PeriodicSigningEnvelope {
    sessionId: string;
    seat: string;
    tick: number;
    clientTime: number;
    /** Current canonical base64 SHA-256 chain head. */
    chainHead: string;
}
/** Encode bytes as canonical padded RFC 4648 base64. */
export declare function signatureBytesToBase64(bytes: Uint8Array): string;
/** Decode canonical padded RFC 4648 base64 with an exact byte length. */
export declare function signatureBytesFromBase64(value: string, label: string, expectedLength: number): Uint8Array;
/** Canonical command bytes signed by the v1 submission scheme. */
export declare function canonicalSubmissionCommandV1(command: JsonValue): Uint8Array;
/** Build the byte-exact RFC-010 submission signature preimage. */
export declare function submissionPreimageV1(envelope: SubmissionSigningEnvelope): Uint8Array;
/** Hash one canonical submission preimage into the next per-seat chain head. */
export declare function submissionChainHashV1(envelope: SubmissionSigningEnvelope): string;
/** Order-independent hash of the complete RFC-010 seat roster. */
export declare function submissionRosterHashV1(seatKeys: readonly SubmissionSeatKey[]): string;
/** First expected chain link for a seat, binding every chain to the roster. */
export declare function submissionGenesisHashV1(sessionId: string, seat: string, rosterHash: string): string;
/**
 * Domain-separated preimage for a periodic signature over the current chain
 * head. Periodic records do not create another chain link.
 */
export declare function periodicSignaturePreimageV1(envelope: PeriodicSigningEnvelope): Uint8Array;
/** Synchronous strict Ed25519 verification for post-hoc replay checking. */
export declare function verifyEd25519(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
/** Verify canonical base64 Ed25519 material without throwing. */
export declare function verifyEd25519Base64(publicKey: string, message: Uint8Array, signature: string): boolean;
/** Generate an extractable client-side Ed25519 key pair with WebCrypto. */
export declare function generateSubmissionKeyPair(): Promise<CryptoKeyPair>;
/** Export a WebCrypto Ed25519 public key in the replay's canonical base64 form. */
export declare function exportSubmissionPublicKey(publicKey: CryptoKey): Promise<string>;
/** Sign arbitrary bytes with a WebCrypto Ed25519 private key. */
export declare function signEd25519Base64(privateKey: CryptoKey, message: Uint8Array): Promise<string>;
/** Sign one RFC-010 submission envelope. */
export declare function signSubmissionV1(privateKey: CryptoKey, envelope: SubmissionSigningEnvelope): Promise<string>;
/** Sign a periodic RFC-010 chain-head checkpoint. */
export declare function signPeriodicChainHeadV1(privateKey: CryptoKey, envelope: PeriodicSigningEnvelope): Promise<string>;
