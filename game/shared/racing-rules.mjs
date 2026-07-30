const CORNER_LIMIT_OFFSET = 3;
const PIT_LANE = ['entrance', 'pit', 'exit'];
const PIT_P_TRACK_CELL = 1;
const PIT_EXIT_TRACK_CELL = 2;

export const DEFAULT_LEVEL = Object.freeze({
  trackLength: 48,
  lapsToWin: 3,
  maxFuel: 15,
  maxSpeed: 6,
  corners: [8, 16, 24, 32, 40],
  pitTrackCells: [0, 2],
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
  const pitTrackCells = Array.isArray(level.pitTrackCells)
    ? [...level.pitTrackCells]
    : [...DEFAULT_LEVEL.pitTrackCells];
  return {
    ...DEFAULT_LEVEL,
    ...level,
    trackLength,
    corners,
    pitTrackCells,
    speedLimits: buildSpeedLimits(trackLength, corners),
  };
}

function rollDie(seed) {
  const nextSeed = (seed * 9301 + 49297) % 233280;
  const value = Math.floor((nextSeed / 233280) * 6) + 1;
  return { value, nextSeed };
}

function cornerIndexForLimit(level, limitAt) {
  return level.corners.findIndex(
    (c) => (c + CORNER_LIMIT_OFFSET) % level.trackLength === limitAt,
  );
}

function moveCells(state, from, distance) {
  if (distance <= 0) {
    return {
      position: from,
      lap: state.lap,
      fuelCost: 0,
      offTrack: false,
    };
  }

  const trackLength = state.level.trackLength;
  let pos = from;
  let steps = 0;
  let offTrack = false;

  for (let step = 0; step < distance; step += 1) {
    pos = (pos + 1) % trackLength;
    steps += 1;

    // 主赛道行驶时跳过 P 房格，P 房只能通过显式“进入 P 房”到达
    if (pos === PIT_P_TRACK_CELL && from !== PIT_P_TRACK_CELL) {
      pos = (pos + 1) % trackLength;
      steps += 1;
    }

    const limit = state.level.speedLimits.find((l) => l.at === pos);
    if (limit) {
      const cornerIdx = cornerIndexForLimit(state.level, limit.at);
      if (state.perfectBrake === cornerIdx) continue;

      if (state.speed > limit.limit) {
        // 冲出赛道：停在红格则在本格冲出；经过红格则在红格下一格冲出
        offTrack = true;
        if (step < distance - 1) {
          pos = (pos + 1) % trackLength;
          steps += 1;
        }
        break;
      }
    }
  }

  const traveled = from + steps;
  const lapsGained = Math.floor(traveled / trackLength);
  const lap = state.lap + lapsGained;
  const position = traveled % trackLength;
  const fuelCost = lapsGained > 0 ? lapsGained : 0;

  return { position, lap, fuelCost, offTrack };
}

function resolvePitMovement(state, isEntering = false) {
  // 进入 P 房：驶过入口直达 P 房通道的 P 格，补油完成，下回合可正常掷骰子出发
  if (isEntering) {
    return {
      ...state,
      inPit: true,
      pitPosition: 1,
      position: PIT_P_TRACK_CELL,
      fuel: state.level.maxFuel,
      pendingRoll: 0,
      roll: state.pendingRoll,
      turn: state.turn + 1,
      lastAction: 'enter-pit',
      message: 'P房补油完成，下回合从P房正常出发',
      perfectBrake: null,
    };
  }

  // 已在 P 房通道入口时点击结束回合：驶入 P 房格并补油
  return {
    ...state,
    inPit: true,
    pitPosition: 1,
    position: PIT_P_TRACK_CELL,
    fuel: state.level.maxFuel,
    pendingRoll: 0,
    roll: state.pendingRoll,
    turn: state.turn + 1,
    lastAction: 'end-turn',
    message: 'P房补油完成，下回合从P房正常出发',
    perfectBrake: null,
  };
}

function resolvePitExitMovement(state, pendingRoll) {
  const distance = state.speed + pendingRoll;

  if (distance <= 0) {
    return {
      ...state,
      pendingRoll: 0,
      roll: pendingRoll,
      turn: state.turn + 1,
      lastAction: 'end-turn',
      message: '原地等待',
    };
  }

  // 从 P 格出发：P -> 出口（1 格），出口 -> 2 号格子（1 格），剩余在主赛道
  if (state.pitPosition === 1) {
    if (distance === 1) {
      // 只能到出口，下回合再进入赛道
      return {
        ...state,
        inPit: true,
        pitPosition: 2,
        position: PIT_EXIT_TRACK_CELL,
        pendingRoll: 0,
        roll: pendingRoll,
        turn: state.turn + 1,
        lastAction: 'end-turn',
        message: '驶至P房出口，下回合进入赛道',
      };
    }
    // distance >= 2：经过出口，进入 2 号格子，剩余 distance - 2 格在主赛道
    const remaining = distance - 2;
    const result = moveCells(state, PIT_EXIT_TRACK_CELL, remaining);
    return buildPitExitResult(state, pendingRoll, distance, result);
  }

  // 从出口出发：出口 -> 2 号格子（1 格），剩余在主赛道
  if (state.pitPosition === 2) {
    const remaining = distance - 1;
    const result = moveCells(state, PIT_EXIT_TRACK_CELL, remaining);
    return buildPitExitResult(state, pendingRoll, distance, result);
  }

  return resolveMovement(state, pendingRoll);
}

function buildPitExitResult(state, pendingRoll, distance, result) {
  let message = pendingRoll > 0
    ? `掷出 ${pendingRoll} 点，共前进 ${distance} 格`
    : '匀速前进';
  if (result.offTrack) {
    message = '冲出赛道！下回合原地停留';
  }

  let nextState = {
    ...state,
    inPit: false,
    pitPosition: 0,
    lap: result.lap,
    position: result.position,
    fuel: state.fuel - result.fuelCost,
    turn: state.turn + 1,
    pendingRoll: 0,
    roll: pendingRoll,
    stunTurns: result.offTrack ? 1 : 0,
    lastAction: 'end-turn',
    message,
  };

  const landedCorner = nextState.level.corners.indexOf(nextState.position);
  nextState = { ...nextState, perfectBrake: landedCorner >= 0 ? landedCorner : null };

  return nextState;
}

function nextActionList(state) {
  if (state.status !== 'playing') return [];
  const actions = [];
  if (state.stunTurns > 0) {
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  // 在 P 房通道入口时，只能结束回合驶入 P 房格
  if (state.inPit && state.pitPosition === 0) {
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  // 在 P 房格或出口时，可以掷骰子、调整速度、结束回合
  if (state.inPit && (state.pitPosition === 1 || state.pitPosition === 2)) {
    if (state.pendingRoll === 0) {
      actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
    }
    actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
    actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  // 只有剩余可移动格数足够驶入 P 房时才显示进入 P 房（0 -> 入口 -> P 房，至少 2 格）
  const distance = state.speed + state.pendingRoll;
  if (state.position === 0 && distance >= 2) {
    actions.push({ id: 'enter-pit', params: 'none', text: '进入P房' });
  }
  if (state.pendingRoll === 0) {
    actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
  }
  actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
  actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
  if (state.fuel < state.level.maxFuel) {
    actions.push({ id: 'pit-stop', params: 'none', text: '原地加油' });
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
    inPit: false,
    pitPosition: 0,
    turn: 0,
    lastAction: 'init',
    status: 'playing',
    message: '比赛准备就绪',
  };
}

function resolveMovement(state, pendingRoll) {
  const distance = state.speed + pendingRoll;
  const result = moveCells(state, state.position, distance);

  let message = pendingRoll > 0
    ? `掷出 ${pendingRoll} 点，共前进 ${distance} 格`
    : '匀速前进';
  if (result.offTrack) {
    message = '冲出赛道！下回合原地停留';
  }

  let nextState = {
    ...state,
    lap: result.lap,
    position: result.position,
    fuel: state.fuel - result.fuelCost,
    turn: state.turn + 1,
    pendingRoll: 0,
    roll: pendingRoll,
    stunTurns: result.offTrack ? 1 : 0,
    inPit: false,
    pitPosition: 0,
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
      message: '原地加油',
    };
  }

  let nextState;
  if (state.inPit && state.pitPosition === 0) {
    // 在 P 房通道入口，结束回合后驶入 P 房格
    nextState = resolvePitMovement(state);
  } else if (state.inPit && (state.pitPosition === 1 || state.pitPosition === 2)) {
    // 在 P 房格或出口，点击结束回合驶出 P 房
    if (actionId === 'end-turn') {
      nextState = resolvePitExitMovement(state, state.pendingRoll);
    } else {
      return state;
    }
  } else if (actionId === 'enter-pit') {
    const distance = state.speed + state.pendingRoll;
    if (state.position !== 0 || distance < 2) return state;
    nextState = resolvePitMovement(state, true);
  } else {
    nextState = resolveMovement(state, state.pendingRoll);
  }

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
      inPit: state.inPit,
      pitPosition: state.pitPosition,
      pitLane: PIT_LANE,
      pitTrackCells: state.level.pitTrackCells,
      lastAction: state.lastAction,
      message: state.message,
      corners: state.level.corners,
      speedLimits: state.level.speedLimits,
    },
  };
}
