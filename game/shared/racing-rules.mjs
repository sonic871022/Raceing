export const DEFAULT_LEVEL = Object.freeze({
  trackLength: 12,
  lapsToWin: 3,
  maxFuel: 5,
  maxSpeed: 4,
  corners: [3, 7, 10],
});

function normalizeLevel(level = {}) {
  return {
    ...DEFAULT_LEVEL,
    ...level,
    corners: Array.isArray(level.corners) ? [...level.corners] : [...DEFAULT_LEVEL.corners],
  };
}

function nextActionList(state) {
  if (state.status !== 'playing') return [];
  const actions = [
    { id: 'cruise', params: 'none', text: 'Move by current speed' },
    { id: 'accelerate', params: 'none', text: 'Increase speed by 1, then move' },
    { id: 'brake', params: 'none', text: 'Reduce speed by 1, then move' },
  ];
  if (state.fuel < state.level.maxFuel) {
    actions.push({ id: 'pit-stop', params: 'none', text: 'Recover 2 fuel and skip movement' });
  }
  return actions;
}

export function createInitialState(level = DEFAULT_LEVEL, seed = 1) {
  const resolvedLevel = normalizeLevel(level);
  return {
    seed,
    level: resolvedLevel,
    seat: 'driver-1',
    lap: 0,
    position: 0,
    speed: 1,
    fuel: 3,
    turn: 0,
    lastAction: 'init',
    status: 'playing',
    message: 'Race ready',
  };
}

function applyCornerRule(state) {
  if (!state.level.corners.includes(state.position)) return state;
  if (state.speed <= 3) return state;
  return {
    ...state,
    speed: 1,
    message: 'Corner penalty: overspeed, reset to speed 1',
  };
}

export function applyAction(state, action = { id: 'cruise' }) {
  if (state.status !== 'playing') return state;

  const actionId = action?.id ?? 'cruise';
  let speed = state.speed;
  let fuel = state.fuel;
  let distance = state.speed;
  let message = 'Cruise forward';

  if (actionId === 'accelerate') {
    speed = Math.min(state.level.maxSpeed, state.speed + 1);
    fuel -= 1;
    distance = speed;
    message = 'Accelerate and move';
  } else if (actionId === 'brake') {
    speed = Math.max(1, state.speed - 1);
    distance = speed;
    message = 'Brake and move';
  } else if (actionId === 'pit-stop') {
    fuel = Math.min(state.level.maxFuel, state.fuel + 2);
    distance = 0;
    message = 'Pit stop for fuel';
  }

  const traveled = state.position + distance;
  const lapsGained = Math.floor(traveled / state.level.trackLength);
  const lap = state.lap + lapsGained;
  const position = traveled % state.level.trackLength;
  const lapFuelCost = lapsGained > 0 ? lapsGained : 0;

  let nextState = {
    ...state,
    lap,
    position,
    speed,
    fuel: fuel - lapFuelCost,
    turn: state.turn + 1,
    lastAction: actionId,
    message,
  };

  nextState = applyCornerRule(nextState);

  if (nextState.fuel < 0) {
    return {
      ...nextState,
      status: 'failed',
      message: 'Out of fuel',
    };
  }

  if (nextState.lap >= nextState.level.lapsToWin) {
    return {
      ...nextState,
      status: 'won',
      message: 'Finish line reached',
    };
  }

  return nextState;
}

export function stateToView(state) {
  return {
    status: state.status,
    activeSeat: state.seat,
    actions: nextActionList(state),
    hud: {
      actionsUsed: state.turn,
      items: [],
    },
    race: {
      lap: state.lap,
      lapsToWin: state.level.lapsToWin,
      position: state.position,
      trackLength: state.level.trackLength,
      speed: state.speed,
      fuel: state.fuel,
      lastAction: state.lastAction,
      message: state.message,
      corners: state.level.corners,
    },
  };
}
