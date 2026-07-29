export interface ResourceClaim<TClaim> {
    /** Stable action/claim identity. */
    id: string;
    /** Stable resource identities consumed or mutated by this action. */
    resources: readonly string[];
    claim: TClaim;
    /** Lower values win in priority arbitration. Defaults to zero. */
    priority?: number;
}
export interface ResourceArbitration<TClaim> {
    accepted: Array<ResourceClaim<TClaim>>;
    contested: Array<ResourceClaim<TClaim>>;
    /** Claim ids grouped by contested resource. */
    conflicts: Map<string, string[]>;
}
export interface ResourceArbitrationOptions {
    /** `all-fail` retains the original behavior. */
    mode?: 'all-fail' | 'priority';
}
/**
 * Arbitrate snapshot-qualified resource claims. The default contests every
 * action sharing a resource; priority mode accepts lower priority values first
 * and uses authored order as the stable tie-break.
 */
export declare function arbitrateResourceClaims<TClaim>(claims: readonly ResourceClaim<TClaim>[], options?: ResourceArbitrationOptions): ResourceArbitration<TClaim>;
