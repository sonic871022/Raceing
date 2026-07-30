import { advanceTick } from '@yugao-gaos/turn-based-grid-sdk/engine';
import { racingReducer } from './reducer.mjs';

let state = racingReducer.init(undefined, 7);

const script = [
  { id: 'roll-dice' },
  { id: 'accelerate' },
  { id: 'end-turn' },
  { id: 'brake' },
  { id: 'end-turn' },
];

for (const action of script) {
  state = advanceTick(racingReducer, state, [action]);
}

console.log(JSON.stringify({
  state,
  view: racingReducer.view(state),
}, null, 2));
