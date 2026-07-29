/**
 * Instance-local product keyword registry. Registration order is part of
 * deterministic layered resolution and never depends on object-key order.
 */
export class KeywordRegistry {
    definitions = new Map();
    nextOrder = 0;
    constructor(definitions = []) {
        for (const definition of definitions)
            this.register(definition);
    }
    register(definition) {
        validateDefinition(definition);
        if (this.definitions.has(definition.id)) {
            throw new Error(`keyword already registered: ${definition.id}`);
        }
        this.definitions.set(definition.id, {
            definition,
            order: this.nextOrder++,
        });
    }
    get(id) {
        return this.definitions.get(id)?.definition;
    }
    require(id) {
        const definition = this.get(id);
        if (!definition)
            throw new RangeError(`unknown keyword: ${id}`);
        return definition;
    }
    registrationOrder(id) {
        const registered = this.definitions.get(id);
        if (!registered)
            throw new RangeError(`unknown keyword: ${id}`);
        return registered.order;
    }
    list() {
        return [...this.definitions.values()]
            .sort((left, right) => left.order - right.order)
            .map(({ definition }) => definition);
    }
}
function validateDefinition(definition) {
    if (!definition || typeof definition !== 'object') {
        throw new TypeError('keyword definition must be an object');
    }
    if (typeof definition.id !== 'string' || definition.id.length === 0) {
        throw new TypeError('keyword id must be a non-empty string');
    }
    if (!['static', 'triggered', 'activated'].includes(definition.kind)) {
        throw new TypeError(`keyword ${definition.id} kind is invalid`);
    }
    if (!Number.isSafeInteger(definition.layer)) {
        throw new TypeError(`keyword ${definition.id} layer must be a safe integer`);
    }
    if (typeof definition.resolve !== 'function') {
        throw new TypeError(`keyword ${definition.id} resolve must be a function`);
    }
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
/**
 * Resolve active keyword instances by layer, authored registration order,
 * acquisition timestamp, source id, then active-list order.
 */
export function resolveKeywordLayerDetails(context, active, registry) {
    if (!Array.isArray(active))
        throw new TypeError('active keywords must be an array');
    const ordered = active.map((instance, authoredOrder) => {
        if (!instance || typeof instance.id !== 'string' || instance.id.length === 0) {
            throw new TypeError('active keyword ids must be non-empty strings');
        }
        if (!Number.isSafeInteger(instance.acquiredAt) || instance.acquiredAt < 0) {
            throw new RangeError(`keyword ${instance.id} acquiredAt must be non-negative`);
        }
        if (instance.sourceId !== undefined
            && (typeof instance.sourceId !== 'string' || instance.sourceId.length === 0)) {
            throw new TypeError(`keyword ${instance.id} sourceId must be a non-empty string`);
        }
        const definition = registry.require(instance.id);
        return {
            instance,
            authoredOrder,
            definition,
            registrationOrder: registry.registrationOrder(instance.id),
        };
    }).sort((left, right) => (left.definition.layer - right.definition.layer
        || left.registrationOrder - right.registrationOrder
        || left.instance.acquiredAt - right.instance.acquiredAt
        || compareText(left.instance.sourceId ?? '', right.instance.sourceId ?? '')
        || left.authoredOrder - right.authoredOrder));
    const resolved = [];
    for (const entry of ordered) {
        const effect = entry.definition.resolve(context);
        if (effect === null)
            continue;
        resolved.push({
            keywordId: entry.definition.id,
            kind: entry.definition.kind,
            layer: entry.definition.layer,
            registrationOrder: entry.registrationOrder,
            acquiredAt: entry.instance.acquiredAt,
            ...(entry.instance.sourceId ? { sourceId: entry.instance.sourceId } : {}),
            effect,
        });
    }
    return resolved;
}
/** Resolve active keyword instances to effects in their contractual order. */
export function resolveKeywordLayers(context, active, registry) {
    return resolveKeywordLayerDetails(context, active, registry)
        .map(({ effect }) => effect);
}
