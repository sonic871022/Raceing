import type { SubmissionSigningTier } from './engine/submission-signatures.js';
export type SeatControllerKind = 'human' | 'agent' | 'service';
export interface SeatController {
    controllerId: string;
    kind: SeatControllerKind;
    publicKey?: string;
    signingTier?: SubmissionSigningTier;
}
export type SeatControlReason = 'genesis' | 'released' | 'disconnected' | 'reconnected' | 'substituted' | 'transferred' | 'revoked';
export interface SeatControlEpoch {
    seat: string;
    epoch: number;
    status: 'occupied' | 'vacant';
    controller?: SeatController;
    effectiveTransitionRevision: number;
    reason: SeatControlReason;
    authorization: 'genesis' | 'controller-handoff' | 'host-policy';
    authorizationEvidence?: SeatControlAuthorization;
    previousEpochDigest?: string;
    previousChainHead?: string;
    digest: string;
}
export interface SeatControlChange {
    seat: string;
    status: 'occupied' | 'vacant';
    controller?: SeatController;
    reason: Exclude<SeatControlReason, 'genesis' | 'reconnected'>;
    previousChainHead?: string;
}
export type SeatControlAuthorization = {
    mode: 'controller-handoff';
    outgoingSignatures: Readonly<Record<string, string>>;
    incomingSignatures: Readonly<Record<string, string>>;
} | {
    mode: 'host-policy';
    policy: string;
};
export interface SeatControlCheckpoint {
    format: 'gaos.seat-control';
    formatVersion: '1.0';
    sessionId: string;
    transitionRevision: number;
    seats: readonly string[];
    epochs: readonly SeatControlEpoch[];
    prepared?: readonly SeatControlPreparedCheckpoint[];
}
export interface SeatControlPreparedCheckpoint {
    baseTransitionRevision: number;
    nextTransitionRevision: number;
    epochs: readonly SeatControlEpoch[];
}
declare const preparedSeatControl: unique symbol;
export interface PreparedSeatControl {
    baseTransitionRevision: number;
    nextTransitionRevision: number;
    epochs: readonly SeatControlEpoch[];
    readonly [preparedSeatControl]: unknown;
}
/**
 * Auditable authority schedule for fixed logical seats. It is independent of
 * transport connections and gameplay participation.
 */
export declare class SeatControlLedger {
    private readonly sessionId;
    private revision;
    private history;
    private readonly owner;
    private readonly prepared;
    private readonly activePrepared;
    constructor(sessionId: string, genesis: Readonly<Record<string, SeatController | null>>);
    seats(): readonly string[];
    transitionRevision(): number;
    current(seat: string): SeatControlEpoch;
    epochAt(seat: string, transitionRevision: number): SeatControlEpoch;
    /**
     * A connection reconnect with unchanged controller/key resumes the current
     * epoch and intentionally creates no evidence transition.
     */
    reconnect(seat: string, controller: SeatController): SeatControlEpoch;
    authorize(seat: string, epoch: number, controllerId?: string, transitionRevision?: number): SeatControlEpoch;
    prepareSeatControl(changes: readonly SeatControlChange[], authorization: SeatControlAuthorization): PreparedSeatControl;
    commit(prepared: PreparedSeatControl): void;
    abort(prepared: PreparedSeatControl): void;
    preparedTransitions(): readonly PreparedSeatControl[];
    checkpoint(): SeatControlCheckpoint;
    static rehydrate(checkpoint: SeatControlCheckpoint): SeatControlLedger;
}
export {};
