/** Resolve one product-neutral gate state transition. */
export function resolveGateTransition(input) {
    if (input.state === 'closed' && input.active) {
        return { state: 'open', changed: true, transition: 'opened' };
    }
    if (input.mode === 'automatic'
        && input.state === 'open'
        && !input.active
        && !input.occupied) {
        return { state: 'closed', changed: true, transition: 'closed' };
    }
    return { state: input.state, changed: false, transition: null };
}
