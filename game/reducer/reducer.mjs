import { createInitialState, applyAction, stateToView } from '../shared/racing-rules.mjs';

export const racingReducer = {
  init(level, seed) {
    return createInitialState(level, seed);
  },

  view(state) {
    return stateToView(state);
  },

  advance(state, inputs) {
    const [action] = Array.isArray(inputs) && inputs.length > 0
      ? inputs
      : [{ id: 'cruise' }];
    return applyAction(state, action);
  },
};

export function createDemoState(level, seed = 1) {
  return racingReducer.init(level, seed);
}
