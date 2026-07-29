import { type JsonValue } from './protocol.js';
import { type SeatControlCheckpoint, type SeatControlEpoch } from './seat-control.js';
export declare const SUBMISSION_SIGNATURE_SCHEME_V2: "gaos.submission.ed25519.v2";
export declare const DYNAMIC_CONTROL_EVIDENCE_FORMAT: "gaos.dynamic-control-evidence.v2";
export interface SubmissionSigningEnvelopeV2 {
    sessionId: string;
    seat: string;
    epoch: number;
    transitionRevision: number;
    submissionId: string;
    cursor: number;
    tick: number;
    clientTime: number;
    command: JsonValue;
    prevChainHash: string;
}
export interface ControllerEpochGenesisV2 {
    sessionId: string;
    seat: string;
    epoch: number;
    controllerId: string;
    publicKey: string;
    transitionDigest: string;
    previousEpochDigest?: string;
    previousChainHead?: string;
}
export interface ControllerHandoffV2 {
    schema: 'gaos.controller-handoff.v2';
    sessionId: string;
    seat: string;
    outgoingEpoch: number;
    outgoingChainHead: string;
    incomingEpoch: number;
    incomingControllerId: string;
    incomingPublicKey: string;
    effectiveTransitionRevision: number;
}
export interface DynamicControlSignedCommand {
    envelope: SubmissionSigningEnvelopeV2;
    signature: string;
}
export interface DynamicControlPeriodicEnvelopeV2 {
    sessionId: string;
    seat: string;
    epoch: number;
    tick: number;
    clientTime: number;
    chainHead: string;
}
export interface DynamicControlPeriodicSignatureV2 {
    envelope: DynamicControlPeriodicEnvelopeV2;
    signature: string;
}
/**
 * Persisted verifier state for one controller epoch. `lastChainHead` is the
 * exact head after all commands included in the evidence. The optional
 * periodic signature closes the prefix ending at `lastSignedChainHead`.
 */
export interface DynamicControlEpochSignatureStateV2 {
    seat: string;
    epoch: number;
    genesisHash: string;
    lastChainHead: string;
    lastSignedChainHead?: string;
    lastPeriodicTick?: number;
    lastPeriodicClientTime?: number;
    lastPeriodicSignature?: string;
}
export interface DynamicControlCheckpointV2 {
    format: 'gaos.dynamic-control-checkpoint.v2';
    sessionId: string;
    control: SeatControlCheckpoint;
    signatureStates: readonly DynamicControlEpochSignatureStateV2[];
}
export interface DynamicControlEvidenceV2 {
    format: typeof DYNAMIC_CONTROL_EVIDENCE_FORMAT;
    sessionId: string;
    checkpoint: DynamicControlCheckpointV2;
    commands: readonly DynamicControlSignedCommand[];
}
export interface EpochVerificationFact {
    seat: string;
    epoch: number;
    authorization: SeatControlEpoch['authorization'];
    authorizationValid: boolean;
    unsignedTail: boolean;
    reasons: string[];
}
export interface DynamicControlVerification {
    valid: boolean;
    commandsValid: boolean;
    controlHistoryValid: boolean;
    epochs: EpochVerificationFact[];
    reasons: string[];
}
/** The first chain head for a controller epoch, including cross-epoch continuity. */
export declare function submissionEpochGenesisHashV2(genesis: ControllerEpochGenesisV2): string;
/** Canonical command preimage for a v2, epoch-bound submission. */
export declare function submissionPreimageV2(envelope: SubmissionSigningEnvelopeV2): Uint8Array;
export declare function submissionChainHashV2(envelope: SubmissionSigningEnvelopeV2): string;
/** Canonical periodic checkpoint preimage for a controller epoch. */
export declare function periodicSignaturePreimageV2(envelope: DynamicControlPeriodicEnvelopeV2): Uint8Array;
export declare function controllerHandoffPreimageV2(handoff: ControllerHandoffV2): Uint8Array;
/**
 * Independently verify the complete v2 controller schedule and every signed
 * command against the epoch active at its transition revision.
 */
export declare function verifyDynamicControlEvidenceV2(evidence: DynamicControlEvidenceV2): DynamicControlVerification;
export type ExternalTrustPurpose = 'identity' | 'timestamp' | 'transparency' | 'witness';
export interface ExternalKeyRef {
    authorityId: string;
    keyId: string;
    purpose: ExternalTrustPurpose;
}
export type ExternalPublicKey = {
    format: 'jwk';
    key: JsonWebKey;
    certificateChain?: string[];
} | {
    format: 'spki';
    key: string;
    certificateChain?: string[];
};
export interface ExternalTrustResolver {
    resolveKey(ref: ExternalKeyRef): Promise<ExternalPublicKey | undefined>;
    verifyCertificatePath?(key: ExternalPublicKey, pinnedRootDigests: readonly string[]): Promise<{
        valid: boolean;
        matchedRootDigest?: string;
        reasons?: string[];
    }>;
    resolveRevocation?(ref: ExternalKeyRef): Promise<{
        state: 'valid' | 'revoked' | 'unknown';
        checkedAt?: string;
        evidence?: ExternalAttestation;
    }>;
}
export interface ExternalSigner {
    readonly key: ExternalKeyRef;
    readonly algorithm: string;
    sign(payload: Uint8Array): Promise<Uint8Array>;
}
export interface ExternalAttestation {
    schema: string;
    authority: ExternalKeyRef;
    subjectDigest: string;
    algorithm: string;
    issuedAt?: string;
    expiresAt?: string;
    payload: JsonValue;
    signature: string;
    certificateChain?: string[];
}
export interface ExternalTrustPolicy {
    pinnedKeys: ExternalKeyRef[];
    pinnedRootDigests?: string[];
    acceptedSchemas: string[];
    acceptedAlgorithms?: string[];
    revocationPolicy?: 'ignore' | 'reject-revoked' | 'require-valid';
}
export interface ExternalTrustResult {
    cryptographicallyValid: boolean;
    authorityPinned: boolean;
    certificatePathValid?: boolean;
    revocationState?: 'valid' | 'revoked' | 'unknown' | 'not-checked';
    policyAccepted: boolean;
    authority?: ExternalKeyRef;
    matchedPin?: string;
    reasons: string[];
}
export declare function externalAttestationPreimage(attestation: Omit<ExternalAttestation, 'signature' | 'certificateChain'>): Uint8Array;
/** Apply only caller-supplied pins and policy; embedded keys never self-anchor. */
export declare function verifyExternalAttestation(attestation: ExternalAttestation, expectedSubjectDigest: string, policy: ExternalTrustPolicy, resolver: ExternalTrustResolver, now?: Date): Promise<ExternalTrustResult>;
