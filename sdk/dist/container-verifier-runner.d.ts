import { type RestrictedVerifierRequest, type RestrictedVerifierResponse, type RestrictedVerifierRunner } from './verifier-kit.js';
export interface ContainerVerifierRunnerOptions {
    /** Immutable image reference, for example registry/repo@sha256:<64 hex>. */
    image: string;
    command?: 'docker' | 'podman';
}
export interface ContainerVerifierInvocation {
    command: 'docker' | 'podman';
    args: string[];
    request: string;
}
/**
 * Build the auditable container invocation used for automatically resolved
 * verifier code. No network, host environment, writable root, or extra
 * processes are granted.
 */
export declare function containerVerifierInvocation(options: ContainerVerifierRunnerOptions, request: RestrictedVerifierRequest, limits: Parameters<RestrictedVerifierRunner['run']>[1]): ContainerVerifierInvocation;
/** Pinned-container implementation of the RFC-016 restricted runner boundary. */
export declare class ContainerVerifierRunner implements RestrictedVerifierRunner {
    #private;
    constructor(options: ContainerVerifierRunnerOptions);
    run(request: RestrictedVerifierRequest, limits: Parameters<RestrictedVerifierRunner['run']>[1]): Promise<RestrictedVerifierResponse>;
}
