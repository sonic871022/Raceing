# Pattern matching

`findPatterns` recognizes product-defined runs and lattice motifs without
assigning meaning to the tokens.

For a run, the product supplies a `BoardLayout`, token locations, directions,
and a minimum length:

```ts
const matches = findPatterns(squareLayout, occupiedByCellKey, {
  shape: { kind: 'run', minLength: 3 },
  matches: (left, right) => left.color === right.color,
});
```

The result contains deterministic, maximal matches. Long runs are reported
once rather than as every shorter sub-run, and scanning from both ends does not
duplicate a match. `TokenRef.cell` is required because arbitrary
`BoardLayout` cell keys are not generally invertible.

Motifs use relative offsets around every possible anchor:

```ts
findPatterns(squareLayout, occupiedByCellKey, {
  shape: {
    kind: 'motif',
    offsets: [[0, 0], [1, 0], [0, 1], [1, 1]],
  },
  matches: (left, right) => left.color === right.color,
});
```

Two-number tuple cells use additive offsets by default. For hex, graph, or
product-specific coordinates, provide `translate(anchor, offset)`. Token ids,
cell keys, directions, and input order must be stable for deterministic
matching.

The helper only reports membership and anchors. Products own match priority,
overlap consumption, scoring, removal, refill, cascades, and presentation.
