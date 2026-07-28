# Resource transactions

Resources are product-defined numeric balances. The SDK has no built-in
`energy`, currency, charge, or inventory semantics, so adding a resource only
changes product configuration:

```ts
const definitions = defineResources({
  energy: { initial: 10, min: 0, max: 20 },
  coins: { initial: 0, min: 0 },
});

const balances = initializeResourceBalances(definitions, savedBalances);
```

Initialization preserves saved values and adds defaults for newly configured
resources. It also retains unknown saved ids so an older runtime does not erase
data written by a newer product.

Any action, trigger, pickup, bell, battery, or other product mechanism can plan
the same transaction primitives:

```ts
const plan = planResourceTransaction(definitions, balances, {
  id: 'ring_bell',
  requirements: [resourceAtLeast('energy', 3)],
  effects: [changeResource('energy', -3)],
});

if (plan.ok) {
  commitResourceTransaction(balances, plan);
  publish(plan.changes);
} else {
  report(plan.failure);
}
```

Planning is mutation-free. Requirements are checked first, effects are then
simulated in authored order, and every bound must pass before commit. Rejection
returns a structured failure, the original balances, and no partial changes.
Successful change records are deterministic and can be published as product
events after commit.

Minimum requirement amounts must be finite and non-negative; resource deltas
must be finite. The factories and planner both throw for invalid authored data,
including raw transaction objects, while ordinary insufficient-resource and
bound failures remain structured transaction results.

AI action limits are separate runtime guardrails. Use
`aiActionLimitExceeded({ actionsUsed, maxActions })` regardless of which, if
any, product resources an AI action consumes.

## Zonoid example

Zonoid projects its Energy HUD onto the generic resource ledger. A committed
action plans an `energy` requirement and debit, while batteries, pickups, and
abilities can publish the same transaction-shaped changes. The SDK validates
the transaction atomically; Zonoid owns Energy capacity, refunds, display, and
which level actions cost energy.

<figure class="mechanism-video">
  <video controls muted playsinline preload="metadata" poster="/mechanisms/resources-poster.jpg" aria-label="Focused Zonoid resource transaction demo board recording">
    <source src="/mechanisms/resources.mp4" type="video/mp4">
    Your browser does not support embedded video.
  </video>
  <figcaption>Focused Zonoid demo board: the player picks up a battery and uses it to restore the Energy shown in the HUD.</figcaption>
</figure>
