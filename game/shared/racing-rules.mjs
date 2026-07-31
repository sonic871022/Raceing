import { createGraphLayout } from '@yugao-gaos/turn-based-grid-sdk/engine';

const CORNER_LIMIT_OFFSET = 3;
const PIT_NODES = ['pit-entrance', 'pit', 'pit-exit'];

export const DEFAULT_LEVEL = Object.freeze({
  trackLength: 48,
  lapsToWin: 3,
  maxFuel: 15,
  maxSpeed: 6,
  corners: ['8', '16', '24', '32', '40'],
});

// 判断是否在主赛道（非 P 房节点）
function isOnMainTrack(position) {
  return typeof position === 'string' && !position.startsWith('pit');
}

// 构建赛道图：主赛道环 + P 房通道
function buildTrackGraph(trackLength) {
  const nodes = [];
  const edges = {};
  for (let i = 0; i < trackLength; i += 1) {
    const id = String(i);
    nodes.push(id);
    edges[id] = [String((i + 1) % trackLength)];
  }
  // 0 号格分叉：主赛道方向 + P 房入口
  edges['0'] = ['1', 'pit-entrance'];
  // P 房通道节点和边
  nodes.push('pit-entrance', 'pit', 'pit-exit');
  edges['pit-entrance'] = ['pit'];
  edges['pit'] = ['pit-exit'];
  edges['pit-exit'] = ['2'];
  return { nodes, edges };
}

function buildSpeedLimits(trackLength, corners) {
  return corners.map((cornerIndex) => ({
    at: String((Number(cornerIndex) + CORNER_LIMIT_OFFSET) % trackLength),
    limit: 3,
  }));
}

function normalizeLevel(level = {}) {
  const trackLength = level.trackLength ?? DEFAULT_LEVEL.trackLength;
  const corners = Array.isArray(level.corners)
    ? level.corners.map(String)
    : [...DEFAULT_LEVEL.corners];
  const { nodes, edges } = buildTrackGraph(trackLength);
  const layout = createGraphLayout({ nodes, edges });
  return {
    ...DEFAULT_LEVEL,
    ...level,
    trackLength,
    corners,
    nodes,
    edges,
    layout,
    pitNodes: [...PIT_NODES],
    speedLimits: buildSpeedLimits(trackLength, corners),
  };
}

function rollDie(seed) {
  const nextSeed = (seed * 9301 + 49297) % 233280;
  const value = Math.floor((nextSeed / 233280) * 6) + 1;
  return { value, nextSeed };
}

function cornerIndexForLimit(level, limitAt) {
  const trackLength = level.trackLength;
  return level.corners.findIndex(
    (c) => String((Number(c) + CORNER_LIMIT_OFFSET) % trackLength) === limitAt,
  );
}

// 沿图的有向边前进，每步取 neighbors[0]（主方向）
function moveOnGraph(state, fromNode, distance) {
  if (distance <= 0) {
    return { position: fromNode, lap: state.lap, fuelCost: 0, offTrack: false };
  }

  const layout = state.level.layout;
  let current = fromNode;
  let offTrack = false;
  let lapsGained = 0;

  for (let step = 0; step < distance; step += 1) {
    const neighbors = layout.neighbors(current);
    if (neighbors.length === 0) break;

    current = neighbors[0];

    // 圈数：经过主赛道 "0" 节点
    if (current === '0') {
      lapsGained += 1;
    }

    // 检查限速（只在主赛道检查）
    const limit = state.level.speedLimits.find((l) => l.at === current);
    if (limit) {
      const cornerIdx = cornerIndexForLimit(state.level, limit.at);
      if (state.perfectBrake === cornerIdx) continue;

      if (state.speed > limit.limit) {
        // 冲出赛道：停在红格则在本格冲出；经过红格则在红格下一格冲出
        offTrack = true;
        if (step < distance - 1) {
          const nextNeighbors = layout.neighbors(current);
          if (nextNeighbors.length > 0) {
            current = nextNeighbors[0];
            if (current === '0') lapsGained += 1;
          }
        }
        break;
      }
    }
  }

  return {
    position: current,
    lap: state.lap + lapsGained,
    fuelCost: lapsGained > 0 ? lapsGained : 0,
    offTrack,
  };
}

// 进入 P 房或从入口驶入 P 房格
function resolvePitMovement(state, isEntering = false) {
  // 进入 P 房：直达 P 房格补油，清零骰子和车速，本回合结束
  if (isEntering) {
    return {
      ...state,
      position: 'pit',
      fuel: state.level.maxFuel,
      pendingRoll: 0,
      roll: 0,
      speed: 0,
      turn: state.turn + 1,
      lastAction: 'enter-pit',
      message: 'P房补油完成，本回合结束，下回合从P房正常出发',
      perfectBrake: null,
    };
  }

  // 从 pit-entrance 出发，前进到 pit 并补油
  return {
    ...state,
    position: 'pit',
    fuel: state.level.maxFuel,
    pendingRoll: 0,
    roll: 0,
    speed: 0,
    turn: state.turn + 1,
    lastAction: 'end-turn',
    message: 'P房补油完成，本回合结束，下回合从P房正常出发',
    perfectBrake: null,
  };
}

// 从 P 房格或出口出发，沿图正常移动
function resolvePitExitMovement(state, pendingRoll) {
  // P 房内必须掷骰子才能移动；未掷骰子时点击回合结束，原地不动
  if (pendingRoll === 0) {
    return {
      ...state,
      pendingRoll: 0,
      roll: 0,
      turn: state.turn + 1,
      lastAction: 'end-turn',
      message: '请先掷骰子再出发',
    };
  }

  const distance = state.speed;
  const result = moveOnGraph(state, state.position, distance);

  let message = pendingRoll > 0
    ? `车速 ${distance}，前进 ${distance} 格`
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
    speed: result.offTrack ? 0 : state.speed,
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

  // 在 P 房入口时，只能结束回合驶入 P 房格
  if (state.position === 'pit-entrance') {
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  // 在 P 房格：刚进入 P 房的本回合只能结束回合；下回合恢复正常操作
  if (state.position === 'pit') {
    if (state.lastAction === 'enter-pit') {
      actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
      return actions;
    }
    if (state.pendingRoll === 0) {
      actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
    }
    actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
    actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  // 在出口时，可以掷骰子、调整速度、结束回合
  if (state.position === 'pit-exit') {
    if (state.pendingRoll === 0) {
      actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
    }
    actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
    actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  // 主赛道：车速足够驶入 P 房时才显示（0 → pit-entrance → pit，至少 2 格）
  const distance = state.speed;
  if (state.position === '0' && distance >= 2) {
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
    position: '0',
    speed: 0,
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
  const distance = state.speed;
  const result = moveOnGraph(state, state.position, distance);

  let message = pendingRoll > 0
    ? `车速 ${distance}，前进 ${distance} 格`
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
    speed: result.offTrack ? 0 : state.speed,
    stunTurns: result.offTrack ? 1 : 0,
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

  // P 房格本回合（刚进入 P 房）：只能结束回合，不能移动/加速/掷骰
  if (state.position === 'pit' && state.lastAction === 'enter-pit') {
    if (actionId === 'end-turn') {
      return {
        ...state,
        pendingRoll: 0,
        roll: 0,
        speed: 0,
        turn: state.turn + 1,
        lastAction: 'end-turn-pit',
        message: 'P房休整完毕，下回合从P房正常出发',
      };
    }
    return state;
  }

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
      speed: result.value,
      lastAction: 'roll-dice',
      message: `掷出 ${result.value} 点，车速设为 ${result.value}`,
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
    const speed = Math.max(0, state.speed - 1);
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
  if (state.position === 'pit-entrance') {
    // 在 P 房入口，结束回合后驶入 P 房格并补油
    nextState = resolvePitMovement(state);
  } else if (state.position === 'pit' || state.position === 'pit-exit') {
    // 从 P 房格或出口出发，正常移动
    if (actionId === 'end-turn') {
      nextState = resolvePitExitMovement(state, state.pendingRoll);
    } else {
      return state;
    }
  } else if (actionId === 'enter-pit') {
    const distance = state.speed + state.pendingRoll;
    if (state.position !== '0' || distance < 2) return state;
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
      isOnPit: !isOnMainTrack(state.position),
      lastAction: state.lastAction,
      message: state.message,
      corners: state.level.corners,
      speedLimits: state.level.speedLimits,
      trackNodes: state.level.nodes.filter(isOnMainTrack),
      pitNodes: state.level.pitNodes,
    },
  };
}
