# RFC-004 — Zones and card play: the zone primitive, deal/draft, keywords, priority, durations

Status: implemented · Ships in: v0.15 · Depends on: RFC-002, RFC-003 · Breaking: no (new family)

## Motivation

Card play is turn-based and deterministic, and most of its machinery already
exists under grid names: seeded shuffles (`seededPermutation`), costs
(resource transactions), one-shot effects (latched triggers), contested picks
(resource claims), opponent scripting (behavior trees), effect cascades
(settlement), and simultaneous reveals (protocol intents). This RFC adds the
missing family — zones and the card-composition mechanisms — under the
standing rules: SDK owns behavior, product owns meaning; every mechanism also
serves grid play; everything is optional.

## Part A — The zone primitive

One primitive, four policy axes. Named zone kinds are **presets**, not types;
no mechanism may branch on a preset name.

```ts
export interface ZoneConfig {
  id: string;
  /** Access discipline: where insert/remove may occur. */
  access: 'lifo' | 'fifo' | 'anyIndex' | 'slots';
  /** Order semantics. 'bag' keeps a canonical hidden internal order. */
  order: 'ordered' | 'bag' | (access extends 'slots' ? 'sparse' : never);
  /** RFC-003 policy: identity and order visibility are independent. */
  visibility: ZoneVisibilityPolicy;
  capacity?: number;               // max entries
  slots?: readonly string[];       // slot keys when access = 'slots'
  seat?: string;                   // seat binding (hands); absent = shared
}
```

Shipped presets (config sugar only): `deck()` = lifo + ordered +
identity-hidden; `hand(seat)` = anyIndex + owner-only + seat-bound;
`queue()` = fifo + public; `bag()` = bag + order-hidden, draws by seeded
roll; `slotRow(keys)` = slots + sparse + capacity 1 per slot;
`discard()` = lifo + fully public.

**Zone vs. board boundary**: zones own collection semantics (ordering,
access); boards own spatial semantics (layout, adjacency). A row of isolated
slots with no adjacency is a slotted zone; the moment adjacency rules appear,
use a `GraphLayout` board. Both are `LocationRef` containers, so arrivals,
portals, and visibility work identically on either — the choice is
migratable.

### Operations

All operations are pure `(state) → state` steps suitable for reducer use, and
multi-entry transfers follow the plan/commit split (push-chain pattern) so a
partially blocked transfer fails all-or-nothing:

```ts
export function planZoneTransfer(state, spec: {
  entries: readonly string[];       // entity/card ids
  from: LocationRef; to: LocationRef;
  insert: 'top' | 'bottom' | { index: number } | { slot: string };
}): ZoneTransferPlan | ZoneTransferFailure;
export function commitZoneTransfer(state, plan): ZoneTransferPlan;

export function shuffleZone(state, zoneId: string, seed: number): TState;   // ordered zones only
export function drawFromZone(state, zoneId, count, seedForBags?): DrawResult; // top for ordered, seeded roll for bags
```

Zone entry dispatches the existing `resolveArrival` (already
location-neutral) and re-evaluates the RFC-003 partition atomically —
observers see a card leave the table and a hand count increment in the same
deterministic step, with identity redacted.

### Deal and draft

- `dealRoundRobin(state, {from, to: seatZones, count, seed})` and
  `dealBatches(...)` compose shuffle + transfer deterministically.
- Drafting = protocol-layer simultaneous intents choosing from a shared zone,
  with contested picks resolved by the existing claims arbitration
  (all-fail or priority, product-chosen).

Grid application: deterministic spawn/loadout distribution uses the same
dealers.

## Part B — Card composition mechanisms

The SDK never owns a keyword's meaning (that is content, exactly like Zonoid
abilities). It owns how keywords compose, order, and expire — the hard,
reusable part.

### Keyword registry and layered resolution

```ts
export interface KeywordDefinition<TCtx, TEffect> {
  id: string;
  kind: 'static' | 'triggered' | 'activated';
  /** Modifier layer; lower layers apply first (the MTG-layers problem). */
  layer: number;
  resolve(ctx: TCtx): TEffect | null;   // product-owned handler
}

/** Deterministic order: layer, then authored registration order, then
 *  acquisition timestamp for same-card duplicates. */
export function resolveKeywordLayers<TCtx, TEffect>(
  ctx: TCtx,
  active: readonly ActiveKeyword[],
  registry: KeywordRegistry<TCtx, TEffect>,
): readonly TEffect[];
```

Grid application: unit traits and stacking status modifiers on grid pieces
resolve through the same layers.

### Priority / response windows

A deterministic seat-priority state machine: who holds priority, pass
tracking, window close when all seats pass consecutively, LIFO resolution of
responses (the "stack"). The product declares which actions are playable in a
window; the SDK owns the passing/closing/unwinding order. Timeouts resolve as
an automatic pass so the machine stays deterministic under the protocol's
intent deadlines.

Structurally a window is not a new turn model: it is a run of ordinary
collection turns (RFC-001 "Sequential turn discipline") in which the
triggering action sits as pending state, seats with legal responses have
non-empty reaction sets, everyone else auto-waits, and an all-wait round
closes the window and unwinds the stack LIFO. This mechanism packages that
loop — the bookkeeping of priority, passes, and unwind order — so products
do not hand-roll it.

Grid application: overwatch, interrupts, and traps that fire during enemy
movement are response windows opened by settlement waves.

### Declarative targeting

```ts
export interface TargetSpec<TCandidate> {
  count: number | { min: number; max: number };
  candidates(view: TurnView): readonly TCandidate[];  // injected enumerator
  distinct?: boolean;
}
export function enumerateTargetChoices<T>(spec: TargetSpec<T>): readonly T[][];
```

Unifies `grid.targetableCells` (candidates = cells) with card targeting
(candidates = zone entries) and feeds the same concrete-action discovery that
`AgentEnvironment` and the solver already rely on. Combinatorial guard:
enumeration is capped and reports truncation explicitly (no silent caps).

### Counters, durations, statuses

Deterministic expiry scheduling tied to phase boundaries: "until end of
turn", "for 3 rounds", N counters. Simultaneous expiries resolve in authored
order. Grid application: buffs, poison, shields on units.

### Phase structure

An authored phase list (`draw → main → combat → end` or product-defined)
lives in the reducer as data; the SDK provides the advance/hook runner and
the phase-boundary events that durations and triggered keywords key off.
Products with an external FSM (e.g. a host platform's own state machine)
may drive phases from outside; the runner is optional like everything else.

### Deck-construction validation

Declarative constraints (`copiesLimit`, `totalSize`, tag/faction rules)
with a pure validator returning structured violations. Grid application:
squad/loadout validation with the same constraint schema.

### Costs

No new mechanism — `planResourceTransaction`/`commitResourceTransaction`
already are the cost system; card plays compose them exactly as grid actions
do today.

## Observation contract

`TurnView.zones` namespace (slot reserved in RFC-001), fully
partition-filtered per RFC-003:

```ts
zones?: Readonly<Record<string, {
  count: number;                          // always visible
  entries?: readonly ZoneEntryView[];     // when identity visible to the seat
  ordered?: boolean;                      // when order visible to the seat
  slots?: Readonly<Record<string, ZoneEntryView | null>>;
}>>;
```

## Test plan

- Axis matrix: every access × order × visibility combination round-trips
  transfer/shuffle/draw with golden per-seat views.
- Bag leak test: `assertNoInformationLeak` over internal order permutations.
- All-or-nothing: transfer into a full/capacity-violating zone fails as a
  unit and leaves state untouched.
- Keyword layers: golden ordering fixtures incl. same-layer timestamp ties.
- Priority: three-seat window with nested responses unwinds LIFO;
  timeout-as-pass determinism.
- Solver: an open-hand solitaire card game solves end-to-end through
  `solveLevel` (proves the neutral core carries cards with zero solver code).

## Historical open questions

Implementation decisions: the family lives on `./engine`; entries remain
product-owned stable ids; declarative actions use `params: 'targets'` and
`targetSpecId`.

1. Are card identities entity ids in product state or SDK-tracked tokens?
   Leaning: product ids throughout; the SDK never mints identity.
2. Should the priority machine live in `./engine` or a new `./play` subpath?
   Leaning: engine, single import surface; revisit if size becomes an issue.
3. `ActionDefinition.params` extension for targeting (deferred from RFC-001):
   propose `params: 'targets'` + `targetSpecId` referencing a product-declared
   spec, keeping the union closed and transcripts flat.
