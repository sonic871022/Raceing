# Grid rays

`traverseGridRay` visits an already ordered iterable of cells until product
policy stops it or the iterable ends. It is useful for beams, hitscan attacks,
scans, line interactions, and other mechanics that need more control than a
boolean line-of-sight test.

## Traversal contract

```ts
const result = traverseGridRay(bresenhamLine(origin, target), (cell, step) => {
  if (wallAt(cell)) return { action: 'stop', value: { kind: 'wall' } };
  if (actorAt(cell)) return { action: 'stop', value: { kind: 'actor' } };
  illuminate(cell);
  return { action: 'continue' };
});
```

Steps are one-based. The iterable normally excludes the origin, making `step`
also the distance from the origin for cardinal unit-step rays. The helper does
not inspect coordinates or enforce adjacency; it trusts iterable order.

## Results

A callback stop returns:

```ts
{ outcome: 'stopped', cell, step, value }
```

Path exhaustion returns:

```ts
{ outcome: 'exhausted', steps }
```

The distinction lets products tell “hit at the last cell” from “reached the end
without a hit.” The stop value is generic and can carry collision, damage, or
presentation data without placing that policy in the SDK.

## Finite and open-ended rays

Finite arrays and generators are both supported. An open-ended iterable must
eventually produce a stop directive; otherwise traversal never returns. Bound
procedural rays by board dimensions or an authored maximum range even when a
collision is expected.

Exceptions from the iterable or visit callback propagate to the caller. Perform
content validation before authoritative resolution rather than treating a
callback failure as exhaustion.

## Relationship to geometry

Use [geometry and FOV](geometry.md) to construct a discrete path. The ray helper
then owns ordered visiting and explicit termination, while the product owns
blockers, piercing, reflection, damage, mutation, and events.

## Zonoid example

Zonoid’s laser and sentry abilities build ordered paths from the platform’s
board geometry, then call `traverseGridRay`. Walls and half-walls stop the ray;
the first eligible unit can receive damage, and shield or friendly-ray policy
is applied by Zonoid at the stop cell. The SDK provides the stable traversal
and distinguishes a hit from an exhausted path.

<figure class="mechanism-video">
  <video controls muted playsinline preload="metadata" poster="/mechanisms/geometry-rays-poster.jpg" aria-label="Focused Zonoid ray geometry demo board recording">
    <source src="/mechanisms/geometry-rays.mp4" type="video/mp4">
    Your browser does not support embedded video.
  </video>
  <figcaption>Focused Zonoid demo board: a divided room shows how walls and boxes change ordered ray traversal and visible cells.</figcaption>
</figure>
