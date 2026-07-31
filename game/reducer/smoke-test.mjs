import { advanceTick } from '@yugao-gaos/turn-based-grid-sdk/engine';
import { racingReducer } from './reducer.mjs';

let state = racingReducer.init(undefined, 7);

const script = [
  { id: 'roll-dice' },
  { id: 'end-turn' },
  { id: 'roll-dice' },
  { id: 'end-turn' },
  { id: 'roll-dice' },
  { id: 'end-turn' },
  { id: 'roll-dice' },
  { id: 'end-turn' },
];

for (const action of script) {
  state = advanceTick(racingReducer, state, [action]);
  const p = state.players[state.activePlayerIndex];
  console.log(`turn ${state.turn}: active=${state.activePlayerIndex}(${p.name}) pos=${p.position} speed=${p.speed} fuel=${p.fuel} lap=${p.lap} status=${state.status}`);
}

console.log('\n=== Final ===');
console.log('status:', state.status);
console.log('activePlayerIndex:', state.activePlayerIndex);
console.log('players:', state.players.map((p, i) => `${i}:${p.name} lap=${p.lap} pos=${p.position} speed=${p.speed} fuel=${p.fuel}`));
console.log('message:', state.message);
