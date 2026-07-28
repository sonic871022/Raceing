import { advanceTick } from '../../sdk/dist/engine/contracts.js';
import { racingReducer } from './reducer.mjs';

let state = racingReducer.init(undefined, 7);

const script = [
  { id: 'accelerate' },
  { id: 'cruise' },
  { id: 'brake' },
  { id: 'pit-stop' },
  { id: 'accelerate' },
];

for (const action of script) {
  state = advanceTick(racingReducer, state, [action]);
}

console.log(JSON.stringify({
  state,
  view: racingReducer.view(state),
}, null, 2));
