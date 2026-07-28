# RFC-003 — Information partitions: per-seat views, hidden zones, fog-of-war

Status: implemented · Ships in: v0.14 · Depends on: RFC-001, RFC-002 · Breaking: no (opt-in), but this is the batch's load-bearing contract decision

## Motivation

The v0.12 engine is a perfect-information machine: `TurnReducer.view(state)`
produces one observation for everyone. Card play requires hidden hands and
decks; grid play gains fog-of-war, stealth, and scouting from the same
capability. Per the batch's standing rule, this ships as **one cross-genre
mechanism** — an information partition — not as a card feature.

## Ownership boundary

The SDK owns: the visibility algebra, deterministic per-seat view derivation,
redaction helpers, transcript redaction format, and leak-check test helpers.
The product owns: the policy — which zones, cells, and entities are visible
to whom, including any geometry predicate used for FOV.

## Visibility algebra

```ts
export type Visibility =
  | { kind: 'public' }
  | { kind: 'seats'; seats: readonly string[] }   // owner-only = one seat
  | { kind: 'hidden' };                            // no seat, count/existence only

export interface ZoneVisibilityPolicy {
  /** Who may see WHICH cards are in the zone. */
  identity(seat: string): Visibility;
  /** Who may see the ORDER of the zone. Independent of identity:
   *  a deck hides identity but has real order; a bag hides order itself;
   *  a hand hides identity from others while its owner controls order. */
  order(seat: string): Visibility;
}

export interface BoardVisibilityPolicy<TCell> {
  /** FOV predicate: typically composed from layout LOS/field helpers. */
  cellVisible(seat: string, cell: TCell): boolean;
  /** Entities on invisible cells; 'shell' = presence without identity. */
  hiddenEntityMode: 'absent' | 'shell';
}
```

Identity and order are **separate dimensions** — this is required by bags
(RFC-004) and cheap now, painful to retrofit.

Fog-of-war is not new machinery: `cellVisible` composes the RFC-002 layout
helpers (`lineOfSight`, `fieldCells`), which promotes the existing geometry
from targeting helpers to observation policy.

## Contract: `viewFor`

```ts
export interface TurnReducer<TLevel, TState, TView extends TurnView = TurnView> {
  init(level: TLevel, seed: number): TState;
  apply(state: TState, action: SubmittedAction): TState;
  view(state: TState): TView;
  /** Optional. Absent ⇒ perfect information; viewFor(s, seat) ≡ view(s). */
  viewFor?(state: TState, seat: string): TView;
}
```

- Perfect-information games change nothing.
- `viewFor` must be pure and deterministic like `view`.
- SDK helper `deriveSeatView(fullView, policies, seat)` implements the
  standard redactions (identities → counts, order shuffles masked, cells
  fogged) so products with conventional policies write no redaction code.
- `TurnView.activeSeat` (RFC-001) tells consumers whose turn it is; legal
  action enumeration for a seat must derive from that seat's view only.

## Determinism and the bag problem

Unordered zones (RFC-004 bags) keep a canonical internal order for
determinism, but that order must never be observable — otherwise replays leak
it. Rule: any state that is `hidden` under the policy must not influence any
`public` field of any seat view except through declared aggregates (counts).
The SDK ships a leak-check helper (below) that products run in tests.

## Transcripts and replay

Two transcript surfaces:

- **Full transcript** (private / server-side): seed + submitted actions.
  `recheckTranscript` re-simulates exactly as today — hidden information is
  no obstacle because verification re-derives it from the seed. Unchanged.
- **Public transcript** (publishable): per-seat observation stream, redacted
  by the same policy that produced live views. New header field
  `visibility: 'full' | 'seat:<id>'` distinguishes them.

New test helper:

```ts
/** Assert no hidden state reaches a seat's view beyond declared aggregates.
 *  Strategy: permute hidden regions (deck order, hidden hands) under the
 *  same seed policy and assert the seat's view stream is bit-identical. */
export function assertNoInformationLeak(options: {...}): void;
```

The permutation strategy mirrors `recheckTranscript`'s existing
permutation-check design, applied to observations instead of outcomes.

## `AgentEnvironment`

```ts
export interface AgentEnvironmentOptions<...> {
  reducer: TurnReducer<...>;
  level: TLevel;
  seed: number;
  /** New: the seat this agent occupies. Default: the single implicit seat. */
  seat?: string;
}
```

- The agent's `observation` becomes `viewFor(state, seat)` when present —
  agents in hidden-information games observe exactly what their seat may see,
  which is what makes them honest benchmark participants.
- Transcripts record the seat and its redacted observations plus the full
  seed, so episodes remain re-verifiable.
- **Scope cut**: this RFC defines per-seat observation for a single agent
  seat (other seats driven by the reducer/behavior trees). Full multi-agent
  episode orchestration (N drivers, simultaneous intents) is a follow-up on
  top of the protocol layer's existing seat machinery and is deliberately not
  in v0.14.

## Solver

`solveLevel` assumes perfect information and keeps using `view`. Document the
boundary: solving is defined for open-information (or open-hand) games only.
No API change.

## Test plan

- Policy matrix fixture: deck/hand/discard/bag/fogged-board, three seats;
  golden per-seat views.
- Leak checks: permute deck order and an opponent hand; assert observer view
  streams identical.
- FOV: square and hex fixtures where `cellVisible` uses `lineOfSight`;
  entity shell mode golden tests.
- Agent: episode transcript for a hidden-deck game re-verifies from seed;
  redacted observations match live views byte-for-byte.

## Historical open questions

Implementation decisions: revelation records are standardized by
`createInformationRevelation`; `deriveSeatView` remains advisory while
`assertNoInformationLeak` supplies the integration enforcement.

1. Reveal events: when a hidden card becomes public (played from hand),
   should the SDK standardize a "revelation" record in views/transcripts, or
   is the state change itself sufficient? Leaning: standardize — agents and
   replay UIs both need it.
2. Should `deriveSeatView` be mandatory (SDK-enforced redaction) or advisory?
   Advisory keeps the reducer boundary honest (products own views), enforced
   prevents leak bugs. Leaning: advisory + `assertNoInformationLeak` in the
   integration checklist.
