# Behavior trees

`evaluateBehaviorTree` runs a small reusable control-flow model over any
product-owned node schema. It recognizes selectors, binary conditions, and
leaves through a typed adapter; it does not prescribe JSON field names,
actions, targeting, or world state.

## Node projection

```ts
const result = evaluateBehaviorTree(context, productTree, {
  inspect(node) {
    if ('select' in node) return { kind: 'selector', children: node.select };
    if ('when' in node) {
      return {
        kind: 'condition',
        condition: node.when,
        then: node.then,
        else: node.else,
      };
    }
    return { kind: 'leaf' };
  },
  test: (ctx, condition, node) => conditionHolds(ctx, condition, node),
  evaluateLeaf: (ctx, node) => chooseProductAction(ctx, node),
});
```

The adapter can project classes, JSON objects, compact tuples, or generated
nodes into the common view without converting the authored tree first.

## Evaluation semantics

- A selector evaluates children in array order and returns the first result
  that is not `null`.
- A condition tests once and evaluates only its selected branch.
- A false condition without an `else` branch returns `null`.
- A leaf delegates entirely to `evaluateLeaf` and may return a result or `null`
  to signal failure/fallthrough.

Only `null` is the failure sentinel. A valid result such as `false`, `0`, or an
empty string still stops selector traversal when represented by `TResult`.

## Determinism and safety

Child ordering is behavior. Preserve authored arrays and ensure `test` and
`evaluateLeaf` read the same authoritative snapshot. If a leaf mutates state,
later evaluation and replay can depend on traversal; it is usually clearer for
leaves to return an order that the reducer commits afterward.

Evaluation is recursive and has no built-in depth or cycle guard. Validate that
authored trees are acyclic and reasonably bounded before running untrusted
content.

## Product responsibilities

The product retains condition vocabulary, target selection, action reuse,
cooldowns, spawning, memory, blackboards, entity rules, and fallback policy.
The SDK guarantees only the selector/condition/leaf control flow and the exact
short-circuit behavior described above.

## Zonoid example

Zonoid authors hostile and allied NPC behavior as product trees. A guard can
select “attack if a target is visible,” otherwise “follow its standing order,”
otherwise “patrol.” The adapter evaluates those conditions against the current
world and returns a product order; the universal reducer then resolves all NPC
orders together with the player’s action.

<figure class="mechanism-video">
  <video controls muted playsinline preload="metadata" poster="/mechanisms/behavior-trees-poster.jpg" aria-label="Focused Zonoid NPC behavior tree demo board recording">
    <source src="/mechanisms/behavior-trees.mp4" type="video/mp4">
    Your browser does not support embedded video.
  </video>
  <figcaption>Focused Zonoid demo board: a guard patrols while the player is hidden, then attacks after the player enters its line of sight.</figcaption>
</figure>
