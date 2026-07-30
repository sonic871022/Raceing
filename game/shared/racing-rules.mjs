const CORNER_LIMIT_OFFSET = 3;

export const DEFAULT_LEVEL = Object.freeze({
  trackLength: 48,
  lapsToWin: 3,
  maxFuel: 15,
  maxSpeed: 6,
  corners: [8, 16, 24, 32, 40],
});

function buildSpeedLimits(trackLength, corners) {
  return corners.map((cornerIndex) => ({
    at: (cornerIndex + CORNER_LIMIT_OFFSET) % trackLength,
    limit: 3,
  }));
}

function normalizeLevel(level = {}) {
  const trackLength = level.trackLength ?? DEFAULT_LEVEL.trackLength;
  const corners = Array.isArray(level.corners) ? [...level.corners] : [...DEFAULT_LEVEL.corners];
  return {
    ...DEFAULT_LEVEL,
    ...level,
    trackLength,
    corners,
    speedLimits: buildSpeedLimits(trackLength, corners),
  };
}

function rollDie(seed) {
  const nextSeed = (seed * 9301 + 49297) % 233280;
  const value = Math.floor((nextSeed / 233280) * 6) + 1;
  return { value, nextSeed };
}

function crossedSpeedLimits(level, from, distance) {
  if (distance <= 0) return [];
  const crossed = [];
  let pos = from;
  for (let step = 0; step < distance; step += 1) {
    pos = (pos + 1) % level.trackLength;
    const limit = level.speedLimits.find((l) => l.at === pos);
    if (limit) crossed.push(limit);
  }
  return crossed;
}

function cornerIndexForLimit(level, limitAt) {
  return level.corners.findIndex(
    (c) => (c + CORNER_LIMIT_OFFSET) % level.trackLength === limitAt,
  );
}

function hasOffTrack(level, from, distance, speed, perfectBrake) {
  if (distance <= 0) return false;
  let pos = from;
  for (let step = 0; step < distance; step += 1) {
    pos = (pos + 1) % level.trackLength;
    const limit = level.speedLimits.find((l) => l.at === pos);
    if (!limit) continue;
    const cornerIdx = cornerIndexForLimit(level, limit.at);
    if (perfectBrake === cornerIdx) continue;
    if (speed > limit.limit) return true;
  }
  return false;
}

function nextActionList(state) {
  if (state.status !== 'playing') return [];
  const actions = [];
  if (state.stunTurns > 0) {
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }
  if (state.pendingRoll === 0) {
    actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
  }
  actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
  actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
  if (state.fuel < state.level.maxFuel) {
    actions.push({ id: 'pit-stop', params: 'none', text: '进站加油' });
  }
  actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
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
    fuel: 10,
    pendingRoll: 0,
    roll: 0,
    perfectBrake: null,
    stunTurns: 0,
    turn: 0,
    lastAction: 'init',
    status: 'playing',
    message: '比赛准备就绪',
  };
}

function resolveMovement(state, pendingRoll) {
  const distance = state.speed + pendingRoll;
  const traveled = state.position + distance;
  const lapsGained = Math.floor(traveled / state.level.trackLength);
  const lap = state.lap + lapsGained;
  const position = traveled % state.level.trackLength;
  const lapFuelCost = lapsGained > 0 ? lapsGained : 0;
  const offTrack = hasOffTrack(state.level, state.position, distance, state.speed, state.perfectBrake);

  let message = pendingRoll > 0
    ? `掷出 ${pendingRoll} 点，共前进 ${distance} 格`
    : '匀速前进';
  if (offTrack) {
    message = '冲出赛道！下回合原地停留';
  }

  let nextState = {
    ...state,
    lap,
    position,
    fuel: state.fuel - lapFuelCost,
    turn: state.turn + 1,
    pendingRoll: 0,
    roll: pendingRoll,
    stunTurns: offTrack ? 1 : 0,
    lastAction: 'end-turn',
    message,
  };

  const landedCorner = nextState.level.corners.indexOf(nextState.position);
  nextState = { ...nextState, perfectBrake: landedCorner >= 0 ? landedCorner : null };

  return nextState;
}

export function applyAction(state, action = { id: 'end-turn' }) {
  if (state.status !== 'playing') return state;

  const actionId = action?.id ?? 'end-turn';

  if (state.stunTurns > 0) {
    return {
      ...state,
      stunTurns: state.stunTurns - 1,
      pendingRoll: 0,
      roll: 0,
      turn: state.turn + 1,
      lastAction: 'stun',
      message: '冲出赛道后休整一回合',
    };
  }

  if (actionId === 'roll-dice') {
    if (state.pendingRoll !== 0) return state;
    const result = rollDie(state.seed);
    return {
      ...state,
      seed: result.nextSeed,
      pendingRoll: result.value,
      roll: result.value,
      lastAction: 'roll-dice',
      message: `掷出 ${result.value} 点，点击“回合结束”前进`,
    };
  }

  if (actionId === 'accelerate') {
    const speed = Math.min(state.level.maxSpeed, state.speed + 1);
    return {
      ...state,
      speed,
      fuel: state.fuel - 1,
      lastAction: 'accelerate',
      message: '加速准备，车速+1',
    };
  }

  if (actionId === 'brake') {
    const speed = Math.max(1, state.speed - 1);
    return {
      ...state,
      speed,
      lastAction: 'brake',
      message: '刹车准备，车速-1',
    };
  }

  if (actionId === 'pit-stop') {
    return {
      ...state,
      fuel: Math.min(state.level.maxFuel, state.fuel + 2),
      lastAction: 'pit-stop',
      message: '进站加油',
    };
  }

  // end-turn
  let nextState = resolveMovement(state, state.pendingRoll);

  if (nextState.fuel < 0) {
    return {
      ...nextState,
      status: 'failed',
      message: '油量耗尽，退出比赛',
    };
  }

  if (nextState.lap >= nextState.level.lapsToWin) {
    return {
      ...nextState,
      status: 'won',
      message: '冲过终点，获得胜利！',
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
      pendingRoll: state.pendingRoll,
      roll: state.roll,
      perfectBrake: state.perfectBrake,
      stunTurns: state.stunTurns,
      lastAction: state.lastAction,
      message: state.message,
      corners: state.level.corners,
      speedLimits: state.level.speedLimits,
    },
  };
}
