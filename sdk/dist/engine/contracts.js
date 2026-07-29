/** Advance one tick through the canonical or compatibility reducer shape. */
export function advanceTick(reducer, state, inputs) {
    if ('advance' in reducer)
        return reducer.advance(state, inputs);
    if (inputs.length === 1)
        return reducer.apply(state, inputs[0]);
    if (inputs.length > 1 && reducer.applyIntents) {
        return reducer.applyIntents(state, inputs);
    }
    if (inputs.length === 0) {
        throw new TypeError('input-free ticks require TickReducer.advance; migrate this compatibility reducer');
    }
    throw new TypeError('multi-input ticks require TickReducer.advance or reducer.applyIntents');
}
/**
 * Read and validate the deterministic replay counter for a reducer state.
 * Action-discovery reducers retain the legacy `view.hud.actionsUsed` fallback.
 */
export function replayMetricsFor(reducer, state, view = reducer.view(state)) {
    const actionsUsed = reducer.replayMetrics === undefined
        ? view.hud?.actionsUsed
        : reducer.replayMetrics(state).actionsUsed;
    if (!Number.isSafeInteger(actionsUsed) || actionsUsed < 0) {
        throw new TypeError('reducer replayMetrics().actionsUsed or view.hud.actionsUsed '
            + 'must be a non-negative safe integer');
    }
    return { actionsUsed: actionsUsed };
}
