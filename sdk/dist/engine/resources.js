function assertFinite(value, label) {
    if (!Number.isFinite(value))
        throw new TypeError(`${label} must be finite`);
}
function assertId(value, label) {
    if (typeof value !== 'string' || !value.trim())
        throw new TypeError(`${label} must not be empty`);
}
function setOwn(target, key, value) {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}
function copyOwn(source) {
    const target = {};
    for (const key of Object.keys(source))
        setOwn(target, key, source[key]);
    return target;
}
function assertRequirementAmount(amount) {
    assertFinite(amount, 'resource minimum amount');
    if (amount < 0)
        throw new RangeError('resource minimum amount must not be negative');
}
function assertResourceDelta(delta) {
    assertFinite(delta, 'resource delta');
}
/** Validate and retain a typed, product-owned resource registry. */
export function defineResources(definitions) {
    for (const [id, definition] of Object.entries(definitions)) {
        assertId(id, 'resource id');
        assertFinite(definition.initial, `resource ${id} initial`);
        if (definition.min !== undefined)
            assertFinite(definition.min, `resource ${id} min`);
        if (definition.max !== undefined)
            assertFinite(definition.max, `resource ${id} max`);
        if (definition.min !== undefined && definition.max !== undefined
            && definition.min > definition.max) {
            throw new RangeError(`resource ${id} min must not exceed max`);
        }
        if ((definition.min !== undefined && definition.initial < definition.min)
            || (definition.max !== undefined && definition.initial > definition.max)) {
            throw new RangeError(`resource ${id} initial must be within bounds`);
        }
    }
    return definitions;
}
/**
 * Add defaults for newly defined resources while preserving every saved balance,
 * including unknown ids so older runtimes do not discard newer product data.
 */
export function initializeResourceBalances(definitions, saved = {}) {
    const balances = copyOwn(saved);
    for (const [id, balance] of Object.entries(balances)) {
        assertFinite(balance, `saved resource ${id} balance`);
        const definition = Object.hasOwn(definitions, id) ? definitions[id] : undefined;
        if (definition && ((definition.min !== undefined && balance < definition.min)
            || (definition.max !== undefined && balance > definition.max))) {
            throw new RangeError(`saved resource ${id} balance must be within bounds`);
        }
    }
    for (const [id, definition] of Object.entries(definitions)) {
        if (!Object.hasOwn(balances, id))
            setOwn(balances, id, definition.initial);
    }
    return balances;
}
export function resourceAtLeast(resourceId, amount) {
    assertId(resourceId, 'resource id');
    assertRequirementAmount(amount);
    return { type: 'resource.minimum', resourceId, amount };
}
export function changeResource(resourceId, delta) {
    assertId(resourceId, 'resource id');
    assertResourceDelta(delta);
    return { type: 'resource.delta', resourceId, delta };
}
/**
 * Validate a resource transaction and calculate its complete result without
 * mutating input. A rejected transaction returns no partial changes.
 */
export function planResourceTransaction(definitions, balances, transaction) {
    const original = balances;
    assertId(transaction.id, 'resource transaction id');
    for (const [id, balance] of Object.entries(balances)) {
        assertId(id, 'resource id');
        assertFinite(balance, `resource ${id} balance`);
    }
    for (const [index, requirement] of (transaction.requirements ?? []).entries()) {
        assertId(requirement.resourceId, 'resource id');
        assertRequirementAmount(requirement.amount);
        if (!Object.hasOwn(definitions, requirement.resourceId)) {
            return {
                ok: false,
                balances: original,
                changes: [],
                failure: {
                    code: 'resource_not_defined',
                    resourceId: requirement.resourceId,
                    phase: 'requirement',
                    index,
                },
            };
        }
        const available = Object.hasOwn(balances, requirement.resourceId)
            ? balances[requirement.resourceId]
            : definitions[requirement.resourceId].initial;
        if (available < requirement.amount) {
            return {
                ok: false,
                balances: original,
                changes: [],
                failure: {
                    code: 'resource_requirement_not_met',
                    resourceId: requirement.resourceId,
                    requirementIndex: index,
                    required: requirement.amount,
                    available,
                },
            };
        }
    }
    const next = copyOwn(balances);
    const changes = [];
    for (const [index, effect] of transaction.effects.entries()) {
        assertId(effect.resourceId, 'resource id');
        assertResourceDelta(effect.delta);
        const definition = Object.hasOwn(definitions, effect.resourceId)
            ? definitions[effect.resourceId]
            : undefined;
        if (!definition) {
            return {
                ok: false,
                balances: original,
                changes: [],
                failure: {
                    code: 'resource_not_defined',
                    resourceId: effect.resourceId,
                    phase: 'effect',
                    index,
                },
            };
        }
        const previous = Object.hasOwn(next, effect.resourceId) ? next[effect.resourceId] : definition.initial;
        const current = previous + effect.delta;
        if (!Number.isFinite(current)) {
            return {
                ok: false,
                balances: original,
                changes: [],
                failure: {
                    code: 'resource_arithmetic_overflow',
                    resourceId: effect.resourceId,
                    effectIndex: index,
                },
            };
        }
        if ((definition.min !== undefined && current < definition.min)
            || (definition.max !== undefined && current > definition.max)) {
            return {
                ok: false,
                balances: original,
                changes: [],
                failure: {
                    code: 'resource_bounds_exceeded',
                    resourceId: effect.resourceId,
                    effectIndex: index,
                    attempted: current,
                    ...(definition.min === undefined ? {} : { min: definition.min }),
                    ...(definition.max === undefined ? {} : { max: definition.max }),
                },
            };
        }
        setOwn(next, effect.resourceId, current);
        changes.push({
            type: 'resource.changed',
            transactionId: transaction.id,
            effectIndex: index,
            resourceId: effect.resourceId,
            previous,
            delta: effect.delta,
            current,
        });
    }
    return { ok: true, balances: next, changes };
}
/** Commit a successful plan into a mutable product-owned balance map. */
export function commitResourceTransaction(balances, plan) {
    if (!plan.ok)
        return false;
    for (const change of plan.changes)
        setOwn(balances, change.resourceId, change.current);
    return true;
}
