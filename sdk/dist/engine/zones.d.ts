import type { ZoneVisibilityPolicy } from './information.js';
import type { LocationRef } from './locations.js';
export type ZoneAccess = 'lifo' | 'fifo' | 'anyIndex' | 'slots';
export type ZoneOrder = 'ordered' | 'bag' | 'sparse';
export interface ZoneConfig {
    id: string;
    /** Access discipline for insertion and removal. */
    access: ZoneAccess;
    /** `sparse` is valid only for a slotted zone; `bag` is never slotted. */
    order: ZoneOrder;
    visibility: ZoneVisibilityPolicy;
    capacity?: number;
    slots?: readonly string[];
    seat?: string;
}
export interface ZoneState {
    config: ZoneConfig;
    /** List storage is ordered bottom-to-top. */
    entries?: readonly string[];
    /** Slotted storage follows `config.slots`; missing keys are treated as null. */
    slots?: Readonly<Record<string, string | null>>;
}
export type ZoneCollection = Readonly<Record<string, ZoneState>>;
export type ZoneInsert = 'top' | 'bottom' | {
    index: number;
} | {
    slot: string;
};
export interface ZoneTransferSpec {
    /** Stable product-owned entity/card ids, in preserved transfer order. */
    entries: readonly string[];
    from: LocationRef;
    to: LocationRef;
    insert: ZoneInsert;
}
export interface ZoneArrival {
    entry: string;
    from: LocationRef;
    to: LocationRef;
}
export type ZoneTransferFailureCode = 'unknown_zone' | 'invalid_location' | 'duplicate_entry' | 'entry_not_found' | 'access_denied' | 'capacity_exceeded' | 'slot_unavailable' | 'stale_plan';
export interface ZoneTransferFailure {
    ok: false;
    code: ZoneTransferFailureCode;
    message: string;
    /** The input collection, unchanged. */
    zones: ZoneCollection;
}
export interface ZoneTransferPlan {
    ok: true;
    entries: readonly string[];
    from: LocationRef;
    to: LocationRef;
    insert: ZoneInsert;
    arrivals: readonly ZoneArrival[];
    /** Planned immutable result. */
    zones: ZoneCollection;
    /** Internal optimistic-concurrency token consumed by commit. */
    readonly baseVersion: string;
    /** Exact immutable collection identity used for the plan. */
    readonly baseZones: ZoneCollection;
}
export type ZoneCommitResult = {
    ok: true;
    zones: ZoneCollection;
} | ZoneTransferFailure;
export interface ZoneCommitOptions {
    /** Runs after the complete immutable zone result exists. */
    arrive?(arrival: ZoneArrival, zones: ZoneCollection): void;
}
export interface DrawResult {
    zones: ZoneCollection;
    entries: readonly string[];
    from: readonly LocationRef[];
}
export interface DealSpec {
    from: string;
    to: readonly string[];
    /** Entries dealt to each destination. */
    count: number;
    seed: number;
    insert?: ZoneInsert | ((zoneId: string, entry: string, dealIndex: number) => ZoneInsert);
}
export interface DealResult {
    ok: true;
    zones: ZoneCollection;
    /** Destination id to entries in deal order. */
    dealt: Readonly<Record<string, readonly string[]>>;
}
/** LIFO ordered zone whose identities and order are hidden from every seat. */
export declare function deck(id?: string): ZoneConfig;
/** Seat-bound ordered collection with owner-only identity and order. */
export declare function hand(seat: string, id?: string): ZoneConfig;
/** Public FIFO ordered collection. */
export declare function queue(id?: string): ZoneConfig;
/** Public-identity collection whose internal order is never observable. */
export declare function bag(id?: string): ZoneConfig;
/** Public sparse row with capacity one per authored slot. */
export declare function slotRow(keys: readonly string[], id?: string): ZoneConfig;
/** Public LIFO ordered collection. */
export declare function discard(id?: string): ZoneConfig;
/** Create one validated immutable zone state. */
export declare function createZone(config: ZoneConfig, initial?: readonly string[] | Readonly<Record<string, string | null>>): ZoneState;
/** Validate and defensively copy a collection keyed by config id. */
export declare function defineZones(zones: ZoneCollection): ZoneCollection;
/**
 * Plan an immutable, all-or-nothing transfer between two zones.
 *
 * List storage is bottom-to-top. Multi-entry LIFO transfers therefore name
 * the selected suffix in stored order, preserving its order at destination.
 */
export declare function planZoneTransfer(zones: ZoneCollection, spec: ZoneTransferSpec): ZoneTransferPlan | ZoneTransferFailure;
/**
 * Commit a transfer plan without mutating either input. Stale plans fail
 * explicitly instead of overwriting newer zone state.
 */
export declare function commitZoneTransfer(zones: ZoneCollection, plan: ZoneTransferPlan, options?: ZoneCommitOptions): ZoneCommitResult;
/** Deterministically shuffle a list-based ordered zone. */
export declare function shuffleZone(zones: ZoneCollection, zoneId: string, seed: number): ZoneCollection;
/** Draw from the top/front of an ordered zone or by seeded selection from a bag. */
export declare function drawFromZone(zones: ZoneCollection, zoneId: string, count: number, seedForBag?: number): DrawResult;
/** Shuffle once, then deal one entry per destination per round. */
export declare function dealRoundRobin(zones: ZoneCollection, spec: DealSpec): DealResult | ZoneTransferFailure;
/** Shuffle once, then deal each destination's complete batch in authored order. */
export declare function dealBatches(zones: ZoneCollection, spec: DealSpec): DealResult | ZoneTransferFailure;
