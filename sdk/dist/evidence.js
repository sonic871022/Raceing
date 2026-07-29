import { canonicalJson } from './protocol.js';
import { signatureBytesFromBase64, signatureBytesToBase64, verifyEd25519Base64, } from './engine/submission-signatures.js';
import { sha256 } from './engine/commitment.js';
import { SeatControlLedger, } from './seat-control.js';
export const SUBMISSION_SIGNATURE_SCHEME_V2 = 'gaos.submission.ed25519.v2';
export const DYNAMIC_CONTROL_EVIDENCE_FORMAT = 'gaos.dynamic-control-evidence.v2';
const encoder = new TextEncoder();
function assertSafeUnsigned(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${label} must be a non-negative safe integer`);
    }
}
function digestBytes(value, label) {
    return signatureBytesFromBase64(value, label, 32);
}
function assertDigest(value, label) {
    if (/^[0-9a-f]{64}$/.test(value))
        return;
    digestBytes(value, label);
}
function canonicalPreimage(domain, value) {
    return encoder.encode(`${domain}\n${canonicalJson(value)}`);
}
/** The first chain head for a controller epoch, including cross-epoch continuity. */
export function submissionEpochGenesisHashV2(genesis) {
    assertSafeUnsigned(genesis.epoch, 'epoch');
    if (!genesis.sessionId || !genesis.seat || !genesis.controllerId) {
        throw new TypeError('epoch genesis identifiers must be non-empty');
    }
    signatureBytesFromBase64(genesis.publicKey, 'publicKey', 32);
    assertDigest(genesis.transitionDigest, 'transitionDigest');
    if (genesis.previousEpochDigest !== undefined) {
        assertDigest(genesis.previousEpochDigest, 'previousEpochDigest');
    }
    if (genesis.previousChainHead !== undefined) {
        digestBytes(genesis.previousChainHead, 'previousChainHead');
    }
    const preimage = canonicalPreimage(`${SUBMISSION_SIGNATURE_SCHEME_V2}.genesis`, genesis);
    return signatureBytesToBase64(sha256(preimage));
}
/** Canonical command preimage for a v2, epoch-bound submission. */
export function submissionPreimageV2(envelope) {
    assertSafeUnsigned(envelope.epoch, 'epoch');
    assertSafeUnsigned(envelope.transitionRevision, 'transitionRevision');
    assertSafeUnsigned(envelope.cursor, 'cursor');
    assertSafeUnsigned(envelope.tick, 'tick');
    assertSafeUnsigned(envelope.clientTime, 'clientTime');
    if (!envelope.sessionId || !envelope.seat || !envelope.submissionId) {
        throw new TypeError('submission identifiers must be non-empty');
    }
    digestBytes(envelope.prevChainHash, 'prevChainHash');
    return canonicalPreimage(`${SUBMISSION_SIGNATURE_SCHEME_V2}.command`, envelope);
}
export function submissionChainHashV2(envelope) {
    return signatureBytesToBase64(sha256(submissionPreimageV2(envelope)));
}
/** Canonical periodic checkpoint preimage for a controller epoch. */
export function periodicSignaturePreimageV2(envelope) {
    assertSafeUnsigned(envelope.epoch, 'epoch');
    assertSafeUnsigned(envelope.tick, 'tick');
    assertSafeUnsigned(envelope.clientTime, 'clientTime');
    if (!envelope.sessionId || !envelope.seat) {
        throw new TypeError('periodic signature identifiers must be non-empty');
    }
    digestBytes(envelope.chainHead, 'chainHead');
    return canonicalPreimage(`${SUBMISSION_SIGNATURE_SCHEME_V2}.periodic`, envelope);
}
export function controllerHandoffPreimageV2(handoff) {
    if (handoff.schema !== 'gaos.controller-handoff.v2') {
        throw new TypeError('unsupported controller handoff schema');
    }
    assertSafeUnsigned(handoff.outgoingEpoch, 'outgoingEpoch');
    assertSafeUnsigned(handoff.incomingEpoch, 'incomingEpoch');
    assertSafeUnsigned(handoff.effectiveTransitionRevision, 'effectiveTransitionRevision');
    if (handoff.incomingEpoch !== handoff.outgoingEpoch + 1) {
        throw new TypeError('handoff epochs must be consecutive');
    }
    digestBytes(handoff.outgoingChainHead, 'outgoingChainHead');
    signatureBytesFromBase64(handoff.incomingPublicKey, 'incomingPublicKey', 32);
    return canonicalPreimage(`${SUBMISSION_SIGNATURE_SCHEME_V2}.handoff`, handoff);
}
function handoffFromEpoch(sessionId, epoch) {
    if (epoch.epoch === 0
        || epoch.authorization !== 'controller-handoff'
        || epoch.status !== 'occupied'
        || epoch.previousChainHead === undefined
        || epoch.controller?.publicKey === undefined) {
        return undefined;
    }
    return {
        schema: 'gaos.controller-handoff.v2',
        sessionId,
        seat: epoch.seat,
        outgoingEpoch: epoch.epoch - 1,
        outgoingChainHead: epoch.previousChainHead,
        incomingEpoch: epoch.epoch,
        incomingControllerId: epoch.controller.controllerId,
        incomingPublicKey: epoch.controller.publicKey,
        effectiveTransitionRevision: epoch.effectiveTransitionRevision,
    };
}
/**
 * Independently verify the complete v2 controller schedule and every signed
 * command against the epoch active at its transition revision.
 */
export function verifyDynamicControlEvidenceV2(evidence) {
    const reasons = [];
    if (evidence.format !== DYNAMIC_CONTROL_EVIDENCE_FORMAT) {
        return {
            valid: false,
            commandsValid: false,
            controlHistoryValid: false,
            epochs: [],
            reasons: ['unsupported dynamic-control evidence format'],
        };
    }
    const checkpoint = evidence.checkpoint;
    const control = checkpoint?.control;
    if (checkpoint?.format !== 'gaos.dynamic-control-checkpoint.v2'
        || checkpoint.sessionId !== evidence.sessionId) {
        reasons.push('invalid dynamic-control checkpoint');
    }
    if (control === undefined || evidence.sessionId !== control.sessionId) {
        reasons.push('control history belongs to a different session');
    }
    let ledger;
    try {
        ledger = SeatControlLedger.rehydrate(control);
    }
    catch (error) {
        reasons.push(error instanceof Error ? error.message : 'invalid control history');
    }
    const epochFacts = [];
    const commandHeads = new Map();
    const reconstructedHeads = new Map();
    const commandCounts = new Map();
    const states = new Map();
    const rawStates = Array.isArray(checkpoint?.signatureStates)
        ? checkpoint.signatureStates
        : [];
    if (!Array.isArray(checkpoint?.signatureStates)) {
        reasons.push('signatureStates must be an array');
    }
    for (const state of rawStates) {
        const key = `${state.seat}:${state.epoch}`;
        if (states.has(key))
            reasons.push(`duplicate signature state for ${key}`);
        states.set(key, state);
    }
    if (ledger !== undefined) {
        for (const epoch of control.epochs) {
            const epochReasons = [];
            let authorizationValid = true;
            if (epoch.authorization === 'controller-handoff') {
                const handoff = handoffFromEpoch(evidence.sessionId, epoch);
                const previous = control.epochs.find((candidate) => candidate.seat === epoch.seat
                    && candidate.epoch === epoch.epoch - 1);
                const auth = epoch.authorizationEvidence;
                if (handoff === undefined
                    || previous?.controller?.publicKey === undefined
                    || auth?.mode !== 'controller-handoff') {
                    authorizationValid = false;
                    epochReasons.push('handoff is missing keys, chain head, or signatures');
                }
                else {
                    const preimage = controllerHandoffPreimageV2(handoff);
                    const outgoing = auth.outgoingSignatures[epoch.seat];
                    const incoming = auth.incomingSignatures[epoch.seat];
                    if (!outgoing || !verifyEd25519Base64(previous.controller.publicKey, preimage, outgoing)) {
                        authorizationValid = false;
                        epochReasons.push('outgoing handoff signature is invalid');
                    }
                    if (!incoming || !verifyEd25519Base64(epoch.controller.publicKey, preimage, incoming)) {
                        authorizationValid = false;
                        epochReasons.push('incoming handoff acceptance is invalid');
                    }
                }
            }
            else if (epoch.authorization === 'host-policy'
                && epoch.authorizationEvidence?.mode !== 'host-policy') {
                authorizationValid = false;
                epochReasons.push('host-policy transition is not explicitly identified');
            }
            epochFacts.push({
                seat: epoch.seat,
                epoch: epoch.epoch,
                authorization: epoch.authorization,
                authorizationValid,
                unsignedTail: false,
                reasons: epochReasons,
            });
            const key = `${epoch.seat}:${epoch.epoch}`;
            const state = states.get(key);
            if (epoch.status === 'occupied'
                && (epoch.controller?.publicKey === undefined
                    || epoch.controller.signingTier === undefined)) {
                reasons.push(`occupied dynamic-control epoch is missing signing policy for ${key}`);
            }
            if (epoch.status === 'occupied' && state === undefined) {
                reasons.push(`missing signature state for ${key}`);
            }
            if (epoch.status === 'occupied' && epoch.controller?.publicKey !== undefined) {
                try {
                    const genesisHash = submissionEpochGenesisHashV2({
                        sessionId: evidence.sessionId,
                        seat: epoch.seat,
                        epoch: epoch.epoch,
                        controllerId: epoch.controller.controllerId,
                        publicKey: epoch.controller.publicKey,
                        transitionDigest: epoch.digest,
                        ...(epoch.previousEpochDigest === undefined
                            ? {}
                            : { previousEpochDigest: epoch.previousEpochDigest }),
                        ...(epoch.previousChainHead === undefined
                            ? {}
                            : { previousChainHead: epoch.previousChainHead }),
                    });
                    if (state !== undefined && state.genesisHash !== genesisHash) {
                        reasons.push(`signature state genesis does not match ${key}`);
                    }
                    commandHeads.set(key, genesisHash);
                    reconstructedHeads.set(key, new Set([genesisHash]));
                }
                catch (error) {
                    reasons.push(error instanceof Error ? error.message : `invalid epoch genesis for ${key}`);
                }
            }
        }
        for (const key of states.keys()) {
            if (!epochFacts.some((fact) => `${fact.seat}:${fact.epoch}` === key)) {
                reasons.push(`signature state belongs to unknown epoch ${key}`);
            }
        }
    }
    let commandsValid = ledger !== undefined;
    const rawCommands = Array.isArray(evidence.commands) ? evidence.commands : [];
    if (!Array.isArray(evidence.commands)) {
        commandsValid = false;
        reasons.push('commands must be an array');
    }
    const ordered = [...rawCommands].sort((left, right) => left.envelope.cursor - right.envelope.cursor);
    if (ordered.some((command, index) => index > 0 && command.envelope.cursor === ordered[index - 1].envelope.cursor)) {
        commandsValid = false;
        reasons.push('signed commands contain duplicate cursors');
    }
    for (const command of ordered) {
        try {
            if (command.envelope.sessionId !== evidence.sessionId) {
                throw new TypeError('signed command belongs to a different session');
            }
            const active = ledger.authorize(command.envelope.seat, command.envelope.epoch, undefined, command.envelope.transitionRevision);
            if (active.controller?.publicKey === undefined) {
                throw new TypeError('active controller epoch has no signing key');
            }
            const key = `${active.seat}:${active.epoch}`;
            const expectedHead = commandHeads.get(key);
            if (expectedHead === undefined) {
                throw new TypeError('signed command references an epoch without signature state');
            }
            if (command.envelope.prevChainHash !== expectedHead) {
                throw new TypeError('signed command does not continue its epoch chain');
            }
            if (!verifyEd25519Base64(active.controller.publicKey, submissionPreimageV2(command.envelope), command.signature)) {
                throw new TypeError('signed command signature is invalid');
            }
            const nextHead = submissionChainHashV2(command.envelope);
            commandHeads.set(key, nextHead);
            reconstructedHeads.get(key)?.add(nextHead);
            commandCounts.set(key, (commandCounts.get(key) ?? 0) + 1);
        }
        catch (error) {
            commandsValid = false;
            reasons.push(error instanceof Error ? error.message : 'invalid signed command');
        }
    }
    for (const fact of epochFacts) {
        const key = `${fact.seat}:${fact.epoch}`;
        const epoch = control?.epochs.find((candidate) => candidate.seat === fact.seat && candidate.epoch === fact.epoch);
        const next = control?.epochs.find((candidate) => candidate.seat === fact.seat && candidate.epoch === fact.epoch + 1);
        const state = states.get(key);
        const computedHead = commandHeads.get(key);
        if (state !== undefined && computedHead !== undefined
            && state.lastChainHead !== computedHead) {
            commandsValid = false;
            reasons.push(`checkpoint chain head does not match ${key}`);
        }
        let periodicValid = true;
        const hasPeriodic = state?.lastSignedChainHead !== undefined
            || state?.lastPeriodicTick !== undefined
            || state?.lastPeriodicClientTime !== undefined
            || state?.lastPeriodicSignature !== undefined;
        if (hasPeriodic) {
            if (state?.lastSignedChainHead === undefined
                || state.lastPeriodicTick === undefined
                || state.lastPeriodicClientTime === undefined
                || state.lastPeriodicSignature === undefined
                || epoch.controller?.publicKey === undefined) {
                periodicValid = false;
            }
            else if (!reconstructedHeads.get(key)?.has(state.lastSignedChainHead)) {
                periodicValid = false;
            }
            else {
                try {
                    periodicValid = verifyEd25519Base64(epoch.controller.publicKey, periodicSignaturePreimageV2({
                        sessionId: evidence.sessionId,
                        seat: epoch.seat,
                        epoch: epoch.epoch,
                        tick: state.lastPeriodicTick,
                        clientTime: state.lastPeriodicClientTime,
                        chainHead: state.lastSignedChainHead,
                    }), state.lastPeriodicSignature);
                }
                catch {
                    periodicValid = false;
                }
            }
            if (!periodicValid) {
                commandsValid = false;
                reasons.push(`periodic signature state is invalid for ${key}`);
            }
        }
        fact.unsignedTail = state !== undefined
            && state.lastSignedChainHead !== undefined
            && state.lastSignedChainHead !== state.lastChainHead;
        if (next?.authorization === 'controller-handoff'
            && (computedHead === undefined || next.previousChainHead !== computedHead)) {
            commandsValid = false;
            fact.unsignedTail = true;
            reasons.push(`voluntary handoff does not continue exact chain head for ${key}`);
        }
        else if (next?.authorization === 'host-policy'
            && next.previousChainHead !== computedHead) {
            fact.unsignedTail = true;
        }
        if (fact.unsignedTail) {
            fact.reasons.push('epoch has an unsigned or incompletely closed tail');
        }
        if (epoch.authorization === 'host-policy') {
            fact.reasons.push('epoch was authorized by declared host policy');
        }
    }
    const controlHistoryValid = ledger !== undefined
        && epochFacts.every((fact) => fact.authorizationValid);
    return {
        valid: reasons.length === 0 && commandsValid && controlHistoryValid,
        commandsValid,
        controlHistoryValid,
        epochs: epochFacts,
        reasons,
    };
}
export function externalAttestationPreimage(attestation) {
    return canonicalPreimage('gaos.external-attestation.v1', attestation);
}
function sameKeyRef(left, right) {
    return left.authorityId === right.authorityId
        && left.keyId === right.keyId
        && left.purpose === right.purpose;
}
/** Apply only caller-supplied pins and policy; embedded keys never self-anchor. */
export async function verifyExternalAttestation(attestation, expectedSubjectDigest, policy, resolver, now = new Date()) {
    const reasons = [];
    let authorityPinned = policy.pinnedKeys.some((pin) => sameKeyRef(pin, attestation.authority));
    let matchedPin = authorityPinned
        ? `${attestation.authority.authorityId}/${attestation.authority.keyId}`
        : undefined;
    if (!policy.acceptedSchemas.includes(attestation.schema)) {
        reasons.push('attestation schema is not accepted');
    }
    if (policy.acceptedAlgorithms !== undefined
        && !policy.acceptedAlgorithms.includes(attestation.algorithm)) {
        reasons.push('attestation algorithm is not accepted');
    }
    if (attestation.subjectDigest !== expectedSubjectDigest) {
        reasons.push('attestation subject digest does not match the verified artifact');
    }
    if (attestation.expiresAt !== undefined) {
        const expires = Date.parse(attestation.expiresAt);
        if (!Number.isFinite(expires) || expires <= now.getTime()) {
            reasons.push('attestation is expired');
        }
    }
    let cryptographicallyValid = false;
    let certificatePathValid;
    const material = await resolver.resolveKey(attestation.authority);
    if (material === undefined) {
        reasons.push('authority key is unavailable');
    }
    else {
        if (!authorityPinned
            && policy.pinnedRootDigests !== undefined
            && policy.pinnedRootDigests.length > 0) {
            const path = await resolver.verifyCertificatePath?.(material, policy.pinnedRootDigests);
            certificatePathValid = path?.valid ?? false;
            reasons.push(...(path?.reasons ?? []));
            if (path?.valid === true
                && path.matchedRootDigest !== undefined
                && policy.pinnedRootDigests.includes(path.matchedRootDigest)) {
                authorityPinned = true;
                matchedPin = path.matchedRootDigest;
            }
        }
        if (attestation.algorithm !== 'Ed25519') {
            reasons.push('unsupported attestation algorithm');
        }
        else {
            try {
                const spki = material.format === 'spki'
                    ? Uint8Array.from(atob(material.key), (character) => character.charCodeAt(0))
                    : undefined;
                const key = material.format === 'jwk'
                    ? await crypto.subtle.importKey('jwk', material.key, { name: 'Ed25519' }, false, ['verify'])
                    : await crypto.subtle.importKey('spki', spki, { name: 'Ed25519' }, false, ['verify']);
                const { signature: _signature, certificateChain: _chain, ...signed } = attestation;
                const signatureBytes = signatureBytesFromBase64(attestation.signature, 'signature', 64);
                const signedBytes = externalAttestationPreimage(signed);
                cryptographicallyValid = await crypto.subtle.verify('Ed25519', key, signatureBytes.slice().buffer, signedBytes.slice().buffer);
                if (!cryptographicallyValid)
                    reasons.push('attestation signature is invalid');
            }
            catch {
                reasons.push('attestation key or signature is malformed');
            }
        }
    }
    if (!authorityPinned) {
        reasons.push('authority key or certificate root is not pinned by product policy');
    }
    let revocationState = 'not-checked';
    if (policy.revocationPolicy !== 'ignore' && policy.revocationPolicy !== undefined) {
        revocationState = (await resolver.resolveRevocation?.(attestation.authority))?.state
            ?? 'unknown';
        if (revocationState === 'revoked')
            reasons.push('authority key is revoked');
        if (policy.revocationPolicy === 'require-valid' && revocationState !== 'valid') {
            reasons.push('authority key has no valid revocation result');
        }
    }
    return {
        cryptographicallyValid,
        authorityPinned,
        ...(certificatePathValid === undefined ? {} : { certificatePathValid }),
        revocationState,
        policyAccepted: reasons.length === 0,
        authority: structuredClone(attestation.authority),
        ...(matchedPin === undefined ? {} : { matchedPin }),
        reasons,
    };
}
