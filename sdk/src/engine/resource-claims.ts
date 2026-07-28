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
export function arbitrateResourceClaims<TClaim>(
  claims: readonly ResourceClaim<TClaim>[],
  options: ResourceArbitrationOptions = {},
): ResourceArbitration<TClaim> {
  if (options.mode !== undefined && options.mode !== 'all-fail' && options.mode !== 'priority') {
    throw new TypeError('resource arbitration mode must be all-fail or priority');
  }
  const ids = new Set<string>();
  const byResource = new Map<string, string[]>();
  for (const entry of claims) {
    if (ids.has(entry.id)) throw new Error(`duplicate resource claim id: ${entry.id}`);
    ids.add(entry.id);
    if (!Array.isArray(entry.resources)
      || entry.resources.some((resource) => typeof resource !== 'string' || resource.length === 0)) {
      throw new TypeError(`resource claim ${entry.id} resources must be non-empty strings`);
    }
    if (entry.priority !== undefined && !Number.isFinite(entry.priority)) {
      throw new TypeError(`resource claim ${entry.id} priority must be finite`);
    }
    for (const resource of new Set(entry.resources)) {
      const resourceClaims = byResource.get(resource) ?? [];
      resourceClaims.push(entry.id);
      byResource.set(resource, resourceClaims);
    }
  }

  const conflicts = new Map<string, string[]>();
  const contestedIds = new Set<string>();
  for (const resource of [...byResource.keys()].sort()) {
    const resourceClaims = byResource.get(resource)!;
    if (resourceClaims.length < 2) continue;
    conflicts.set(resource, [...resourceClaims]);
    for (const id of resourceClaims) contestedIds.add(id);
  }
  if ((options.mode ?? 'all-fail') === 'all-fail') {
    return {
      accepted: claims.filter(({ id }) => !contestedIds.has(id)),
      contested: claims.filter(({ id }) => contestedIds.has(id)),
      conflicts,
    };
  }

  const authoredOrder = new Map(claims.map((claim, index) => [claim.id, index]));
  const ordered = [...claims].sort((left, right) => (
    (left.priority ?? 0) - (right.priority ?? 0)
    || authoredOrder.get(left.id)! - authoredOrder.get(right.id)!
  ));
  const claimed = new Set<string>();
  const acceptedIds = new Set<string>();
  for (const claim of ordered) {
    const resources = new Set(claim.resources);
    if ([...resources].some((resource) => claimed.has(resource))) continue;
    acceptedIds.add(claim.id);
    for (const resource of resources) claimed.add(resource);
  }
  return {
    accepted: claims.filter(({ id }) => acceptedIds.has(id)),
    contested: claims.filter(({ id }) => !acceptedIds.has(id)),
    conflicts,
  };
}
