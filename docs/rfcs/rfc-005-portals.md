# RFC-005 — Portals: entity transit across heterogeneous containers

Status: implemented · Ships in: v0.16 · Depends on: RFC-002, RFC-004 · Breaking: no (new family)

## Motivation

Portals are authored tunnels between locations in **different kinds of
containers**: hex board ↔ zone, zone ↔ graph board, board ↔ board. They are
the mechanism that makes hybrid games feel native rather than bolted
together — a unit returns to hand and becomes a card; a card deploys onto a
territory; a bag feeds a spawn cell. The existing `transport` family is a
same-space conveyor (`directionAt` does coordinate arithmetic); portals are
the cross-space jump. They chain: a conveyor can push a crate into a portal.

## Ownership boundary

The SDK owns: the edge set model, deterministic transit ordering, contention
arbitration, all-or-nothing group transit, bounded multi-hop chaining with
cycle guards, cross-container adaptation contracts, and atomic visibility
re-evaluation. The product owns: which portals exist, activation conditions,
tolls, identity transformation in the tunnel, and presentation.

## Contracts

```ts
export interface PortalEdge {
  id: string;
  from: LocationRef;
  to: LocationRef;
  bidirectional?: boolean;
  /** Lower resolves first among simultaneous transits; then authored order. */
  priority?: number;
}

export interface PortalPolicy<TState, TEntity> {
  /** Activation — typically composes gate state, power, or trigger latches. */
  isActive(state: TState, edge: PortalEdge): boolean;
  canTransit(state: TState, entity: TEntity, edge: PortalEdge): boolean;
  /** Destination adaptation. Exactly one applies per edge endpoint kind. */
  insertInto?: { mode: 'top' | 'bottom' | 'index' | 'slot'; pick?(state, entity): number | string };
  placeOnto?(state: TState, entity: TEntity, edge: PortalEdge): LocationCoord | null; // board exit cell
  /** Board exits: full occupied-cell set at destination (footprint rehydration). */
  occupiesAt?(entity: TEntity, at: LocationCoord): readonly LocationCoord[];
  /** Product-owned transformation, applied atomically inside the commit
   *  (unit ⇄ card duality). SDK guarantees atomicity, never meaning. */
  transform?(entity: TEntity, edge: PortalEdge): TEntity;
}
```

### Plan / commit

```ts
export function planPortalTransits<TState, TEntity>(
  state: TState,
  entrants: readonly { entity: TEntity; at: LocationRef }[],
  edges: readonly PortalEdge[],
  policy: PortalPolicy<TState, TEntity>,
): PortalTransitPlan | PortalTransitFailure;

export function commitPortalTransits(state, plan): CommitResult; // arrivals nearest-first, like push chains
```

- **All-or-nothing groups**: a declared group (mounted unit + rider, a
  multi-card move) transits as a unit or fails as a unit — push-chain
  plan/commit discipline.
- **Contention**: multiple entrants into one capacity-limited destination
  resolve through the existing claims arbitration (product picks all-fail or
  priority policy). Destination cell occupancy uses `canEnter`-style checks
  consistent with movement.
- **Multi-hop**: an exit landing on another active portal entrance re-enters
  planning, bounded by `maxPasses` with a convergence guard and explicit
  cycle detection (visited `locationKey` set per entity per cascade) — the
  `resolveFlightPasses`/settlement-limit pattern. A cycle is reported, never
  an infinite loop.

### Composition (no new machinery)

| Need | Existing mechanism |
|---|---|
| Openable/closable portal | Gate on the edge (`resolveGateTransition`) |
| Toll / cost to transit | Resource transaction in `canTransit`/commit |
| Portal opens when lever pulled | Latched trigger flips activation state |
| Powered portal networks ("all blue portals active while a blue source is powered") | `buildLinkedComponentSources` verbatim |
| Effects on arrival | `resolveArrival` at the destination container |
| Cascade scheduling | Settlement worklist jobs; transits are traced consequences |
| Hidden-info crossing | RFC-003 partition re-evaluated atomically in commit (identity redacts as the entity enters a hidden zone, counts update in the same step) |

### Zone-internal moves are not portals

Draw, discard, and tutor are plain zone transfers (RFC-004 primitives).
Portals are **authored edges with policy on top of transfers** — they compose
the transfer primitive rather than replace it. A product may still model
deck→hand as a portal edge when it wants portal policy (activation, tolls,
triggers) on the draw itself.

## What this enables (documentation showcase list)

- Return-to-hand: board unit transits into a hand zone, `transform` makes it
  a card.
- Deploy: card exits through a deploy portal onto a graph-board territory.
- Bag-building: draw-bag zone → spawn-cell portal (token-bag games).
- Garrison/embark: board → container zone owned by another entity.
- Multi-board dungeons: stair portals between floors with different layouts.

Everything stays à la carte: cards-only games use zone↔zone edges,
grid-only games use board↔board tunnels, and neither imports the other's
container family.

## Determinism requirements

- Transit order: settlement wave order, then edge priority, then authored
  edge order, then entrant priority — all covered by golden traces.
- `placeOnto` returning an occupied/invalid cell fails the plan (reported,
  not silently dropped).
- Transform runs exactly once per committed transit, inside the commit.

## Test plan

- Heterogeneous chain fixture: hex board → bag zone → graph board through two
  edges in one settlement cascade; golden causal trace.
- Cycle: two mutually-linked portals report a cycle at the pass cap.
- Group failure: rider+mount where the mount's destination is blocked leaves
  both untouched.
- Contested entry: three entrants, capacity one — claims arbitration golden
  for both all-fail and priority policies.
- Visibility atomicity: observer's view stream across a board→hidden-zone
  transit shows departure + count increment in one step, no identity frame.
- Replay: transcripts with portal transits re-verify via `recheckTranscript`.

## Historical open questions

Implementation decisions: edge arrays are authored inputs and may be rebuilt
deterministically between turns; response windows remain an explicit
post-settlement composition and are off by default.

1. Should `PortalEdge` live in product state (fully dynamic portals) or be
   authored data with dynamic activation only? Leaning: authored data +
   dynamic activation; products needing spawned portals rebuild the edge set
   between turns, which stays deterministic.
2. Do transits open RFC-004 priority windows (responses to "when X enters
   Y")? Composes naturally — windows are opened by settlement waves — but
   the default should be off; document the pattern instead of wiring it.
