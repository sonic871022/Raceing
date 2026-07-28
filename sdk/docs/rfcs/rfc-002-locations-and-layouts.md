# RFC-002 — Locations and layouts: `LocationRef`, `BoardLayout`, multi-board games

Status: implemented · Ships in: v0.13 · Depends on: RFC-001 · Breaking: no

## Motivation

Three requirements share one root:

1. games declare **multiple boards** and (later) multiple zones;
2. boards come in **square, hex, and graph** layouts;
3. portals (RFC-005) move entities **between heterogeneous containers**.

The root is that the engine needs one addressing concept for "a place an
entity can be." Half the engine is already there — transport, chain
reactions, rays, and arrivals take `key(node)`/`neighbors(node)` callbacks
and never assume a lattice. This RFC names that convention (`LocationRef`),
extends it to the geometry module (`BoardLayout`), and leaves the genuinely
square algorithms as the square layout's implementation.

## Ownership boundary

The SDK owns: the location addressing scheme, the layout interface, shipped
square/hex/graph layouts, and layout-parameterized pathfinding/LOS/field
algorithms. The product owns: which containers exist, their dimensions and
adjacency data, terrain meaning, and blocker policy (unchanged — geometry
already takes `isBlocked` callbacks).

## `LocationRef`

```ts
/** Coordinate within a container: lattice cell, graph node key, or zone index/slot. */
export type LocationCoord = Cell | string | number;

export interface LocationRef {
  /** Board or zone id. Products with one implicit board may omit ids at the edges. */
  container: string;
  coord: LocationCoord;
}

/** Canonical string key: stable across runs, usable as Map keys and in transcripts. */
export function locationKey(ref: LocationRef): string;
```

`locationKey` is the bridge to the existing callback mechanisms: a chain
reaction or transport network spanning two boards uses
`key: (n) => locationKey(n)` today with zero further SDK change.

## `BoardLayout`

```ts
export interface BoardLayout<TCell = Cell> {
  /** Deterministically ordered neighbors. Order is part of the contract. */
  neighbors(cell: TCell): readonly TCell[];
  distance(a: TCell, b: TCell): number;
  /** Cells from `from` (exclusive) to `to` (inclusive); the LOS/ray substrate. */
  line(from: TCell, to: TCell): readonly TCell[];
  contains(cell: TCell): boolean;
  key(cell: TCell): string;
}
```

Shipped implementations:

| Layout | Coord | Notes |
|---|---|---|
| `createSquareLayout({width, height, steps?})` | `Cell` | Wraps existing `CARDINAL_STEPS`, `manhattanDistance`, `bresenhamLine` unchanged; `steps` admits diagonals |
| `createHexAxialLayout({contains})` | `Cell` (axial q,r) | Six axial neighbor vectors; distance `(|dq|+|dr|+|dq+dr|)/2`; line via cube-lerp rounding with deterministic tie-break toward lower key |
| `createGraphLayout({nodes, edges})` | `string` | Arbitrary adjacency (territory maps, node webs); `distance` = BFS hops; `line` = BFS shortest path (documented as non-geometric) |

### Layout-parameterized algorithms

New generic entry points; the existing square-specific exports remain and
become thin wrappers (not deprecated — they are the square implementation):

```ts
export function shortestPath<TCell>(layout: BoardLayout<TCell>, options: {
  start: TCell; goal: TCell;
  isBlocked(cell: TCell): boolean;
  allowBlockedGoal?: boolean;
}): TCell[];

export function nearestReachablePath<TCell>(layout: BoardLayout<TCell>, options: {...}): ReachableCellPath<TCell> | null;

export function lineOfSight<TCell>(layout: BoardLayout<TCell>, from: TCell, to: TCell,
  blocksSight: (cell: TCell) => boolean): boolean;

/** Field of effect: hex arcs and square cones both implement this shape. */
export function fieldCells<TCell>(layout: BoardLayout<TCell>, options: FieldOptions<TCell>): TCell[];
```

Note `shortestGridPath` already accepts custom `steps`, so hex pathfinding
works on v0.12 by passing the six axial vectors; this RFC makes that a named,
documented layout instead of a trick.

## Movement generalization

`resolveMoves` needs only coordinate equality, so it already works on hex
axial coordinates for 1×1 movers. Two generalizations:

1. **Keyed movers** for graph boards:

```ts
export interface KeyedMover<TCell> {
  id: string;
  from: TCell;
  to: TCell;
  priority: number;
  /** Generalizes rectangular footprint: the full cell set occupied at `at`. */
  occupies?(at: TCell): readonly TCell[];
  swapOk?: string[];
}

export function resolveKeyedMoves<TCell>(
  movers: readonly KeyedMover<TCell>[],
  options: { key(cell: TCell): string; isStaticBlocked(cell: TCell): boolean },
): MoveResolution<TCell>;
```

2. **Footprints become cell sets.** `occupies()` subsumes
   `footprint: {width, height}` (the rectangle is the square layout's
   convenience helper `rectFootprint(w, h)`), and gives hex/graph movers
   multi-cell bodies. `resolveMoves` remains as the square fast path and is
   re-implemented over `resolveKeyedMoves` internally; identical outputs are
   a release gate.

## Multi-board addressing

- `SubmittedAction.boardId` (RFC-001) names the target board.
- `TurnView.grid` becomes per-board: `grid?: Readonly<Record<string, GridViewNamespace>>`
  with the single-board form (plain namespace) accepted through the
  deprecation window.
- Movement/settlement across boards: movers on different boards cannot
  collide, so products call `resolveKeyedMoves` per board; settlement jobs
  already carry no board notion and schedule cross-board consequences freely.
- Agent tools (`AGENT_TOOL_DEFINITIONS`) gain `boardId` parameters with the
  same optionality rule.

## Determinism requirements

- `neighbors()` order is contractual and covered by layout golden tests.
- Hex line tie-breaks (cube rounding at exact midpoints) resolve toward the
  lower `key()`; documented and tested.
- `GraphLayout` BFS visits neighbors in authored edge order.

## Test plan

- Golden parity: `resolveMoves` vs `resolveKeyedMoves` over the full existing
  movement suite.
- Hex: distance/line/path property tests against cube-coordinate oracle;
  axial collision resolution reuses the movement suite with hex coords.
- Graph: territory-map fixture (non-planar, asymmetric edges) for path, LOS
  (degenerate), transport, and chain reactions via `locationKey`.
- Multi-board: two-board fixture where a settlement wave on board A schedules
  a trigger on board B; replay transcript round-trips.

## Historical open questions

Implementation decisions: graph `line()` is the deterministic authored-order
BFS path, and zones use numeric coordinates for list indices plus string
coordinates for slot keys.

1. Should `line()` on `GraphLayout` throw instead of returning a BFS path?
   (LOS on a territory graph is usually meaningless.) Leaning: keep BFS,
   document; products wanting stricter semantics inject their own layout.
2. Do zones get `LocationRef.coord` as index (ordered) and slot key
   (slotted) both, or always a canonical string? Decide in RFC-004 alongside
   the zone primitive.
