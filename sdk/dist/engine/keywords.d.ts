export type KeywordKind = 'static' | 'triggered' | 'activated';
export interface KeywordDefinition<TContext, TEffect> {
    id: string;
    kind: KeywordKind;
    /** Lower layers resolve first. */
    layer: number;
    resolve(context: TContext): TEffect | null;
}
export interface ActiveKeyword {
    id: string;
    /** Product-owned acquisition tick. Lower values resolve first. */
    acquiredAt: number;
    /** Stable source identity for duplicate keyword instances. */
    sourceId?: string;
}
export interface ResolvedKeyword<TEffect> {
    keywordId: string;
    kind: KeywordKind;
    layer: number;
    registrationOrder: number;
    acquiredAt: number;
    sourceId?: string;
    effect: TEffect;
}
/**
 * Instance-local product keyword registry. Registration order is part of
 * deterministic layered resolution and never depends on object-key order.
 */
export declare class KeywordRegistry<TContext, TEffect> {
    private readonly definitions;
    private nextOrder;
    constructor(definitions?: readonly KeywordDefinition<TContext, TEffect>[]);
    register(definition: KeywordDefinition<TContext, TEffect>): void;
    get(id: string): KeywordDefinition<TContext, TEffect> | undefined;
    require(id: string): KeywordDefinition<TContext, TEffect>;
    registrationOrder(id: string): number;
    list(): readonly KeywordDefinition<TContext, TEffect>[];
}
/**
 * Resolve active keyword instances by layer, authored registration order,
 * acquisition timestamp, source id, then active-list order.
 */
export declare function resolveKeywordLayerDetails<TContext, TEffect>(context: TContext, active: readonly ActiveKeyword[], registry: KeywordRegistry<TContext, TEffect>): readonly ResolvedKeyword<TEffect>[];
/** Resolve active keyword instances to effects in their contractual order. */
export declare function resolveKeywordLayers<TContext, TEffect>(context: TContext, active: readonly ActiveKeyword[], registry: KeywordRegistry<TContext, TEffect>): readonly TEffect[];
