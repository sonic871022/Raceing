/** A product-defined numeric resource. The SDK assigns no meaning to its id. */
export interface ResourceDefinition {
    initial: number;
    min?: number;
    max?: number;
}
export type ResourceDefinitions = Readonly<Record<string, ResourceDefinition>>;
export type ResourceBalances = Readonly<Record<string, number>>;
export interface ResourceMinimumRequirement {
    type: 'resource.minimum';
    resourceId: string;
    amount: number;
}
export interface ResourceDeltaEffect {
    type: 'resource.delta';
    resourceId: string;
    delta: number;
}
export interface ResourceTransaction {
    /** Stable product identity for the action, trigger, pickup, or other mechanism. */
    id: string;
    requirements?: readonly ResourceMinimumRequirement[];
    effects: readonly ResourceDeltaEffect[];
}
export interface ResourceChange {
    type: 'resource.changed';
    transactionId: string;
    effectIndex: number;
    resourceId: string;
    previous: number;
    delta: number;
    current: number;
}
export type ResourceTransactionFailure = {
    code: 'resource_not_defined';
    resourceId: string;
    phase: 'requirement' | 'effect';
    index: number;
} | {
    code: 'resource_requirement_not_met';
    resourceId: string;
    requirementIndex: number;
    required: number;
    available: number;
} | {
    code: 'resource_bounds_exceeded';
    resourceId: string;
    effectIndex: number;
    attempted: number;
    min?: number;
    max?: number;
} | {
    code: 'resource_arithmetic_overflow';
    resourceId: string;
    effectIndex: number;
};
export type ResourceTransactionPlan = {
    ok: true;
    balances: ResourceBalances;
    changes: readonly ResourceChange[];
} | {
    ok: false;
    balances: ResourceBalances;
    changes: readonly [];
    failure: ResourceTransactionFailure;
};
/** Validate and retain a typed, product-owned resource registry. */
export declare function defineResources<const T extends Record<string, ResourceDefinition>>(definitions: T): Readonly<T>;
/**
 * Add defaults for newly defined resources while preserving every saved balance,
 * including unknown ids so older runtimes do not discard newer product data.
 */
export declare function initializeResourceBalances(definitions: ResourceDefinitions, saved?: ResourceBalances): ResourceBalances;
export declare function resourceAtLeast(resourceId: string, amount: number): ResourceMinimumRequirement;
export declare function changeResource(resourceId: string, delta: number): ResourceDeltaEffect;
/**
 * Validate a resource transaction and calculate its complete result without
 * mutating input. A rejected transaction returns no partial changes.
 */
export declare function planResourceTransaction(definitions: ResourceDefinitions, balances: ResourceBalances, transaction: ResourceTransaction): ResourceTransactionPlan;
/** Commit a successful plan into a mutable product-owned balance map. */
export declare function commitResourceTransaction(balances: Record<string, number>, plan: ResourceTransactionPlan): boolean;
