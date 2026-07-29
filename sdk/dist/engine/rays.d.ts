export type GridRayDirective<TStop> = {
    action: 'continue';
} | {
    action: 'stop';
    value: TStop;
};
export type GridRayResult<TCell, TStop> = {
    outcome: 'stopped';
    cell: TCell;
    step: number;
    value: TStop;
} | {
    outcome: 'exhausted';
    steps: number;
};
/**
 * Visit cells in ray order until product policy stops the ray or the supplied
 * path ends. Steps are one-based so they also represent distance from an
 * origin excluded by the path.
 *
 * Open-ended iterables are supported, but their callback must eventually stop.
 */
export declare function traverseGridRay<TCell, TStop>(cells: Iterable<TCell>, visit: (cell: TCell, step: number) => GridRayDirective<TStop>): GridRayResult<TCell, TStop>;
