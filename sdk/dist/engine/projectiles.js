/**
 * Advance every projectile present at the start of the pass by at most one
 * cell. Collection mutation by land/consume callbacks cannot skip another
 * projectile because the input is snapshotted before iteration.
 */
export function advancePathProjectiles(projectiles, options) {
    let activity = false;
    for (const projectile of [...projectiles]) {
        const next = options.next(projectile);
        if (next === undefined) {
            options.land(projectile);
            activity = true;
            continue;
        }
        const action = options.collide(projectile, next);
        if (action === 'advance')
            options.advance(projectile, next);
        else if (action === 'land')
            options.land(projectile);
        else
            options.consume(projectile);
        activity = true;
    }
    return activity;
}
/** Resolve full same-tick flight, with an optional relay hook between passes. */
export function resolveFlightPasses(state, options) {
    if (!Number.isSafeInteger(options.maxPasses) || options.maxPasses < 1) {
        throw new RangeError('flight maxPasses must be a positive safe integer');
    }
    let passes = 0;
    while (options.active(state) && passes < options.maxPasses) {
        options.beforePass?.(state, passes);
        options.advancePass(state, passes);
        passes += 1;
    }
    return { state, passes, completed: !options.active(state) };
}
