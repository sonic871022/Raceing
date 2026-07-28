import type { ZoneVisibilityPolicy } from './information.js';
import type { LocationRef } from './locations.js';
import { seededPermutation } from './random.js';

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

export type ZoneInsert =
  | 'top'
  | 'bottom'
  | { index: number }
  | { slot: string };

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

export type ZoneTransferFailureCode =
  | 'unknown_zone'
  | 'invalid_location'
  | 'duplicate_entry'
  | 'entry_not_found'
  | 'access_denied'
  | 'capacity_exceeded'
  | 'slot_unavailable'
  | 'stale_plan';

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

export type ZoneCommitResult =
  | { ok: true; zones: ZoneCollection }
  | ZoneTransferFailure;

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

const PUBLIC_VISIBILITY: ZoneVisibilityPolicy = {
  identity: () => ({ kind: 'public' }),
  order: () => ({ kind: 'public' }),
};

const HIDDEN_VISIBILITY: ZoneVisibilityPolicy = {
  identity: () => ({ kind: 'hidden' }),
  order: () => ({ kind: 'hidden' }),
};

function ownerVisibility(seat: string): ZoneVisibilityPolicy {
  return {
    identity: () => ({ kind: 'seats', seats: [seat] }),
    order: () => ({ kind: 'seats', seats: [seat] }),
  };
}

/** LIFO ordered zone whose identities and order are hidden from every seat. */
export function deck(id = 'deck'): ZoneConfig {
  return { id, access: 'lifo', order: 'ordered', visibility: HIDDEN_VISIBILITY };
}

/** Seat-bound ordered collection with owner-only identity and order. */
export function hand(seat: string, id = `hand:${seat}`): ZoneConfig {
  assertId(seat, 'hand seat');
  return {
    id,
    access: 'anyIndex',
    order: 'ordered',
    visibility: ownerVisibility(seat),
    seat,
  };
}

/** Public FIFO ordered collection. */
export function queue(id = 'queue'): ZoneConfig {
  return { id, access: 'fifo', order: 'ordered', visibility: PUBLIC_VISIBILITY };
}

/** Public-identity collection whose internal order is never observable. */
export function bag(id = 'bag'): ZoneConfig {
  return {
    id,
    access: 'anyIndex',
    order: 'bag',
    visibility: {
      identity: () => ({ kind: 'public' }),
      order: () => ({ kind: 'hidden' }),
    },
  };
}

/** Public sparse row with capacity one per authored slot. */
export function slotRow(keys: readonly string[], id = 'slots'): ZoneConfig {
  return {
    id,
    access: 'slots',
    order: 'sparse',
    visibility: PUBLIC_VISIBILITY,
    slots: [...keys],
    capacity: keys.length,
  };
}

/** Public LIFO ordered collection. */
export function discard(id = 'discard'): ZoneConfig {
  return { id, access: 'lifo', order: 'ordered', visibility: PUBLIC_VISIBILITY };
}

function assertId(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertConfig(config: ZoneConfig): void {
  if (!config || typeof config !== 'object') throw new TypeError('zone config must be an object');
  assertId(config.id, 'zone id');
  if (!['lifo', 'fifo', 'anyIndex', 'slots'].includes(config.access)) {
    throw new TypeError(`zone ${config.id} access is invalid`);
  }
  if (!['ordered', 'bag', 'sparse'].includes(config.order)) {
    throw new TypeError(`zone ${config.id} order is invalid`);
  }
  if (config.access === 'slots') {
    if (config.order !== 'sparse') {
      throw new TypeError(`slotted zone ${config.id} must use sparse order`);
    }
    if (!Array.isArray(config.slots) || config.slots.length === 0
      || config.slots.some((slot) => typeof slot !== 'string' || slot.length === 0)
      || new Set(config.slots).size !== config.slots.length) {
      throw new TypeError(`slotted zone ${config.id} requires unique non-empty slot keys`);
    }
  } else if (config.order === 'sparse' || config.slots !== undefined) {
    throw new TypeError(`non-slotted zone ${config.id} cannot use sparse order or slots`);
  }
  if (config.order === 'bag' && config.access === 'slots') {
    throw new TypeError(`bag zone ${config.id} cannot use slot access`);
  }
  if (config.capacity !== undefined
    && (!Number.isSafeInteger(config.capacity) || config.capacity < 0)) {
    throw new RangeError(`zone ${config.id} capacity must be a non-negative safe integer`);
  }
  if (config.access === 'slots' && config.capacity !== undefined
    && config.capacity > config.slots!.length) {
    throw new RangeError(`slotted zone ${config.id} capacity cannot exceed its slot count`);
  }
  if (!config.visibility
    || typeof config.visibility.identity !== 'function'
    || typeof config.visibility.order !== 'function') {
    throw new TypeError(`zone ${config.id} requires identity and order visibility policies`);
  }
  if (config.seat !== undefined) assertId(config.seat, `zone ${config.id} seat`);
}

function entryCount(zone: ZoneState): number {
  return zone.config.access === 'slots'
    ? Object.values(zone.slots ?? {}).filter((entry) => entry !== null).length
    : (zone.entries ?? []).length;
}

function copyConfig(config: ZoneConfig): ZoneConfig {
  return {
    ...config,
    ...(config.slots ? { slots: [...config.slots] } : {}),
  };
}

function copyZone(zone: ZoneState): ZoneState {
  return {
    config: copyConfig(zone.config),
    ...(zone.entries ? { entries: [...zone.entries] } : {}),
    ...(zone.slots ? { slots: { ...zone.slots } } : {}),
  };
}

function validateZone(zone: ZoneState, key?: string): void {
  if (!zone || typeof zone !== 'object') throw new TypeError('zone state must be an object');
  assertConfig(zone.config);
  if (key !== undefined && key !== zone.config.id) {
    throw new TypeError(`zone key ${key} must match config id ${zone.config.id}`);
  }
  if (zone.config.access === 'slots') {
    if (zone.entries !== undefined) throw new TypeError(`slotted zone ${zone.config.id} cannot have entries`);
    const values = zone.slots ?? {};
    for (const [slot, entry] of Object.entries(values)) {
      if (!zone.config.slots!.includes(slot)) {
        throw new TypeError(`zone ${zone.config.id} contains undeclared slot ${slot}`);
      }
      if (entry !== null) assertId(entry, `zone ${zone.config.id} slot entry`);
    }
  } else {
    if (zone.slots !== undefined) throw new TypeError(`list zone ${zone.config.id} cannot have slots`);
    if (!Array.isArray(zone.entries)
      || zone.entries.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
      throw new TypeError(`zone ${zone.config.id} entries must be non-empty string ids`);
    }
  }
  if (new Set(zone.entries ?? Object.values(zone.slots ?? {}).filter(
    (entry): entry is string => entry !== null,
  )).size !== entryCount(zone)) {
    throw new TypeError(`zone ${zone.config.id} entry ids must be unique`);
  }
  const capacity = zone.config.capacity
    ?? (zone.config.access === 'slots' ? zone.config.slots!.length : Number.POSITIVE_INFINITY);
  if (entryCount(zone) > capacity) throw new RangeError(`zone ${zone.config.id} exceeds capacity`);
}

function validateCollection(zones: ZoneCollection): void {
  if (!zones || typeof zones !== 'object' || Array.isArray(zones)) {
    throw new TypeError('zone collection must be a record');
  }
  const allEntries = new Set<string>();
  for (const [id, zone] of Object.entries(zones)) {
    validateZone(zone, id);
    const entries = zone.entries ?? Object.values(zone.slots ?? {}).filter(
      (entry): entry is string => entry !== null,
    );
    for (const entry of entries) {
      if (allEntries.has(entry)) throw new TypeError(`entry appears in multiple zones: ${entry}`);
      allEntries.add(entry);
    }
  }
}

/** Create one validated immutable zone state. */
export function createZone(
  config: ZoneConfig,
  initial?: readonly string[] | Readonly<Record<string, string | null>>,
): ZoneState {
  assertConfig(config);
  const normalizedInitial = initial
    ?? (config.access === 'slots' ? {} : []);
  if (config.access === 'slots' && Array.isArray(normalizedInitial)) {
    throw new TypeError(`slotted zone ${config.id} initial state must be a slot record`);
  }
  if (config.access !== 'slots' && !Array.isArray(normalizedInitial)) {
    throw new TypeError(`list zone ${config.id} initial state must be an entry array`);
  }
  const zone: ZoneState = config.access === 'slots'
    ? {
      config: copyConfig(config),
      slots: Object.fromEntries(config.slots!.map((slot) => [
        slot,
        Array.isArray(normalizedInitial)
          ? null
          : (normalizedInitial as Readonly<Record<string, string | null>>)[slot] ?? null,
      ])),
    }
    : {
      config: copyConfig(config),
      entries: Array.isArray(normalizedInitial) ? [...normalizedInitial] : [],
    };
  validateZone(zone);
  return zone;
}

/** Validate and defensively copy a collection keyed by config id. */
export function defineZones(zones: ZoneCollection): ZoneCollection {
  validateCollection(zones);
  return Object.fromEntries(Object.entries(zones).map(([id, zone]) => [id, copyZone(zone)]));
}

function versionOf(zones: ZoneCollection): string {
  return JSON.stringify(Object.keys(zones).sort().map((id) => {
    const zone = zones[id]!;
    return {
      id,
      access: zone.config.access,
      order: zone.config.order,
      capacity: zone.config.capacity ?? null,
      slotKeys: zone.config.slots ?? null,
      seat: zone.config.seat ?? null,
      entries: zone.entries ?? null,
      slots: zone.slots
        ? Object.fromEntries(Object.keys(zone.slots).sort().map((slot) => [slot, zone.slots![slot]]))
        : null,
    };
  }));
}

function failure(
  zones: ZoneCollection,
  code: ZoneTransferFailureCode,
  message: string,
): ZoneTransferFailure {
  return { ok: false, code, message, zones };
}

function sameEntries(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function locationPointsTo(
  zone: ZoneState,
  location: LocationRef,
  firstEntry: string,
): boolean {
  if (zone.config.access === 'slots') {
    return typeof location.coord === 'string' && zone.slots?.[location.coord] === firstEntry;
  }
  return typeof location.coord === 'number' && zone.entries?.[location.coord] === firstEntry;
}

function removeEntries(
  zone: ZoneState,
  entries: readonly string[],
): ZoneState | ZoneTransferFailureCode {
  if (zone.config.access === 'slots') {
    const slots = { ...(zone.slots ?? {}) };
    for (const entry of entries) {
      const slot = zone.config.slots!.find((key) => slots[key] === entry);
      if (!slot) return 'entry_not_found';
      slots[slot] = null;
    }
    return { config: copyConfig(zone.config), slots };
  }

  const current = [...zone.entries!];
  if (entries.some((entry) => !current.includes(entry))) return 'entry_not_found';
  if (zone.config.access === 'lifo'
    && !sameEntries(current.slice(current.length - entries.length), entries)) {
    return 'access_denied';
  }
  if (zone.config.access === 'fifo'
    && !sameEntries(current.slice(0, entries.length), entries)) {
    return 'access_denied';
  }
  const removed = new Set(entries);
  return {
    config: copyConfig(zone.config),
    entries: current.filter((entry) => !removed.has(entry)),
  };
}

function insertEntries(
  zone: ZoneState,
  entries: readonly string[],
  insert: ZoneInsert,
): ZoneState | ZoneTransferFailureCode {
  const capacity = zone.config.capacity
    ?? (zone.config.access === 'slots' ? zone.config.slots!.length : Number.POSITIVE_INFINITY);
  if (entryCount(zone) + entries.length > capacity) return 'capacity_exceeded';

  if (zone.config.access === 'slots') {
    if (typeof insert !== 'object' || !('slot' in insert)
      || entries.length !== 1 || !zone.config.slots!.includes(insert.slot)) {
      return 'access_denied';
    }
    if ((zone.slots?.[insert.slot] ?? null) !== null) return 'slot_unavailable';
    return {
      config: copyConfig(zone.config),
      slots: { ...(zone.slots ?? {}), [insert.slot]: entries[0]! },
    };
  }

  if (typeof insert === 'object' && 'slot' in insert) return 'access_denied';
  if (zone.config.access === 'lifo' && insert !== 'top') return 'access_denied';
  if (zone.config.access === 'fifo' && insert !== 'top') return 'access_denied';
  const current = [...zone.entries!];
  if (insert === 'top') current.push(...entries);
  else if (insert === 'bottom') current.unshift(...entries);
  else {
    if (!Number.isSafeInteger(insert.index)
      || insert.index < 0 || insert.index > current.length) return 'invalid_location';
    current.splice(insert.index, 0, ...entries);
  }
  return { config: copyConfig(zone.config), entries: current };
}

function finalLocation(zone: ZoneState, entry: string): LocationRef {
  if (zone.config.access === 'slots') {
    const slot = zone.config.slots!.find((key) => zone.slots?.[key] === entry)!;
    return { container: zone.config.id, coord: slot };
  }
  return { container: zone.config.id, coord: zone.entries!.indexOf(entry) };
}

/**
 * Plan an immutable, all-or-nothing transfer between two zones.
 *
 * List storage is bottom-to-top. Multi-entry LIFO transfers therefore name
 * the selected suffix in stored order, preserving its order at destination.
 */
export function planZoneTransfer(
  zones: ZoneCollection,
  spec: ZoneTransferSpec,
): ZoneTransferPlan | ZoneTransferFailure {
  validateCollection(zones);
  if (!spec || !Array.isArray(spec.entries) || spec.entries.length === 0) {
    throw new TypeError('zone transfer entries must be a non-empty array');
  }
  if (spec.entries.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new TypeError('zone transfer entries must contain non-empty ids');
  }
  if (new Set(spec.entries).size !== spec.entries.length) {
    return failure(zones, 'duplicate_entry', 'zone transfer entries must be unique');
  }
  const source = zones[spec.from.container];
  const target = zones[spec.to.container];
  if (!source || !target) {
    return failure(zones, 'unknown_zone', 'zone transfer references an unknown container');
  }
  if (!locationPointsTo(source, spec.from, spec.entries[0]!)) {
    return failure(zones, 'invalid_location', 'source location does not identify the first entry');
  }

  const without = removeEntries(source, spec.entries);
  if (typeof without === 'string') {
    return failure(zones, without, `cannot remove entries from zone ${source.config.id}`);
  }
  const working: Record<string, ZoneState> = { ...zones, [source.config.id]: without };
  const destinationBase = source.config.id === target.config.id ? without : target;
  const inserted = insertEntries(destinationBase, spec.entries, spec.insert);
  if (typeof inserted === 'string') {
    return failure(zones, inserted, `cannot insert entries into zone ${target.config.id}`);
  }
  working[target.config.id] = inserted;
  const next = defineZones(working);
  const arrivals = spec.entries.map((entry) => ({
    entry,
    from: { container: spec.from.container, coord: spec.from.coord },
    to: finalLocation(next[target.config.id]!, entry),
  }));
  return {
    ok: true,
    entries: [...spec.entries],
    from: { container: spec.from.container, coord: spec.from.coord },
    to: { container: spec.to.container, coord: spec.to.coord },
    insert: typeof spec.insert === 'object' ? { ...spec.insert } : spec.insert,
    arrivals,
    zones: next,
    baseVersion: versionOf(zones),
    baseZones: zones,
  };
}

/**
 * Commit a transfer plan without mutating either input. Stale plans fail
 * explicitly instead of overwriting newer zone state.
 */
export function commitZoneTransfer(
  zones: ZoneCollection,
  plan: ZoneTransferPlan,
  options: ZoneCommitOptions = {},
): ZoneCommitResult {
  validateCollection(zones);
  if (!plan || plan.ok !== true) throw new TypeError('zone transfer plan is required');
  if (!Object.is(zones, plan.baseZones) || versionOf(zones) !== plan.baseVersion) {
    return failure(zones, 'stale_plan', 'zone transfer plan no longer matches zone state');
  }
  const committed = defineZones(plan.zones);
  for (const arrival of plan.arrivals) options.arrive?.(arrival, committed);
  return { ok: true, zones: committed };
}

/** Deterministically shuffle a list-based ordered zone. */
export function shuffleZone(
  zones: ZoneCollection,
  zoneId: string,
  seed: number,
): ZoneCollection {
  validateCollection(zones);
  const zone = zones[zoneId];
  if (!zone) throw new RangeError(`unknown zone: ${zoneId}`);
  if (zone.config.order !== 'ordered' || zone.config.access === 'slots') {
    throw new TypeError('only list-based ordered zones can be shuffled');
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('shuffle seed must be an unsigned 32-bit integer');
  }
  const order = seededPermutation(zone.entries!.length, seed);
  return defineZones({
    ...zones,
    [zoneId]: {
      config: copyConfig(zone.config),
      entries: order.map((index) => zone.entries![index]!),
    },
  });
}

function drawSelection(zone: ZoneState, count: number, seed?: number): number[] {
  const length = zone.entries!.length;
  if (count > length) throw new RangeError(`zone ${zone.config.id} does not contain ${count} entries`);
  if (zone.config.order === 'bag') {
    if (seed === undefined || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new RangeError('bag draws require an unsigned 32-bit seed');
    }
    return seededPermutation(length, seed).slice(0, count);
  }
  if (zone.config.order !== 'ordered') throw new TypeError('cannot draw from a sparse zone');
  if (zone.config.access === 'fifo') return Array.from({ length: count }, (_, index) => index);
  return Array.from({ length: count }, (_, index) => length - 1 - index);
}

/** Draw from the top/front of an ordered zone or by seeded selection from a bag. */
export function drawFromZone(
  zones: ZoneCollection,
  zoneId: string,
  count: number,
  seedForBag?: number,
): DrawResult {
  validateCollection(zones);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('draw count must be a non-negative safe integer');
  }
  const zone = zones[zoneId];
  if (!zone) throw new RangeError(`unknown zone: ${zoneId}`);
  if (zone.config.access === 'slots') throw new TypeError('cannot draw from a slotted zone');
  const selected = drawSelection(zone, count, seedForBag);
  const selectedSet = new Set(selected);
  const entries = selected.map((index) => zone.entries![index]!);
  const next = defineZones({
    ...zones,
    [zoneId]: {
      config: copyConfig(zone.config),
      entries: zone.entries!.filter((_entry, index) => !selectedSet.has(index)),
    },
  });
  return {
    zones: next,
    entries,
    from: selected.map((index) => ({ container: zoneId, coord: index })),
  };
}

function nextDraw(zones: ZoneCollection, zoneId: string, seed: number): {
  entry: string;
  at: LocationRef;
} {
  const zone = zones[zoneId]!;
  const index = drawSelection(zone, 1, seed)[0]!;
  return { entry: zone.entries![index]!, at: { container: zoneId, coord: index } };
}

function defaultDealInsert(zone: ZoneState): ZoneInsert | undefined {
  if (zone.config.access !== 'slots') return 'top';
  const slot = zone.config.slots!.find((key) => (zone.slots?.[key] ?? null) === null);
  return slot ? { slot } : undefined;
}

function assertDealSpec(zones: ZoneCollection, spec: DealSpec): void {
  if (!spec || typeof spec !== 'object') throw new TypeError('deal spec must be an object');
  if (!zones[spec.from]) throw new RangeError(`unknown deal source zone: ${spec.from}`);
  if (!Array.isArray(spec.to) || spec.to.length === 0
    || spec.to.some((id) => typeof id !== 'string' || !zones[id])) {
    throw new RangeError('deal destinations must be known zone ids');
  }
  if (new Set(spec.to).size !== spec.to.length) {
    throw new TypeError('deal destinations must be unique');
  }
  if (spec.to.includes(spec.from)) {
    throw new TypeError('deal source cannot also be a destination');
  }
  if (!Number.isSafeInteger(spec.count) || spec.count < 0) {
    throw new RangeError('deal count must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(spec.seed) || spec.seed < 0 || spec.seed > 0xffff_ffff) {
    throw new RangeError('deal seed must be an unsigned 32-bit integer');
  }
}

function deal(
  zones: ZoneCollection,
  spec: DealSpec,
  destinationOrder: readonly string[],
): DealResult | ZoneTransferFailure {
  validateCollection(zones);
  assertDealSpec(zones, spec);
  let working = zones[spec.from]!.config.order === 'ordered'
    ? shuffleZone(zones, spec.from, spec.seed)
    : defineZones(zones);
  const dealt = Object.fromEntries(spec.to.map((id) => [id, [] as string[]]));
  let dealIndex = 0;
  for (const destinationId of destinationOrder) {
    const draw = nextDraw(working, spec.from, (spec.seed + dealIndex) >>> 0);
    const destination = working[destinationId]!;
    const insert = typeof spec.insert === 'function'
      ? spec.insert(destinationId, draw.entry, dealIndex)
      : spec.insert ?? defaultDealInsert(destination);
    if (!insert) {
      return failure(zones, 'slot_unavailable', `zone ${destinationId} has no empty deal slot`);
    }
    const plan = planZoneTransfer(working, {
      entries: [draw.entry],
      from: draw.at,
      to: { container: destinationId, coord: typeof insert === 'object' && 'slot' in insert
        ? insert.slot
        : entryCount(destination) },
      insert,
    });
    if (!plan.ok) return { ...plan, zones };
    const committed = commitZoneTransfer(working, plan);
    if (!committed.ok) return { ...committed, zones };
    working = committed.zones;
    dealt[destinationId]!.push(draw.entry);
    dealIndex++;
  }
  return { ok: true, zones: working, dealt };
}

/** Shuffle once, then deal one entry per destination per round. */
export function dealRoundRobin(
  zones: ZoneCollection,
  spec: DealSpec,
): DealResult | ZoneTransferFailure {
  assertDealSpec(zones, spec);
  const order: string[] = [];
  for (let round = 0; round < spec.count; round++) order.push(...spec.to);
  return deal(zones, spec, order);
}

/** Shuffle once, then deal each destination's complete batch in authored order. */
export function dealBatches(
  zones: ZoneCollection,
  spec: DealSpec,
): DealResult | ZoneTransferFailure {
  assertDealSpec(zones, spec);
  return deal(
    zones,
    spec,
    spec.to.flatMap((destination) => Array.from(
      { length: spec.count },
      () => destination,
    )),
  );
}
