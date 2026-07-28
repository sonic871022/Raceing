export type GridRayDirective<TStop> =
  | { action: 'continue' }
  | { action: 'stop'; value: TStop };

export type GridRayResult<TCell, TStop> =
  | { outcome: 'stopped'; cell: TCell; step: number; value: TStop }
  | { outcome: 'exhausted'; steps: number };

/**
 * Visit cells in ray order until product policy stops the ray or the supplied
 * path ends. Steps are one-based so they also represent distance from an
 * origin excluded by the path.
 *
 * Open-ended iterables are supported, but their callback must eventually stop.
 */
export function traverseGridRay<TCell, TStop>(
  cells: Iterable<TCell>,
  visit: (cell: TCell, step: number) => GridRayDirective<TStop>,
): GridRayResult<TCell, TStop> {
  let step = 0;
  for (const cell of cells) {
    step += 1;
    const directive = visit(cell, step);
    if (directive.action === 'stop') {
      return { outcome: 'stopped', cell, step, value: directive.value };
    }
  }
  return { outcome: 'exhausted', steps: step };
}
