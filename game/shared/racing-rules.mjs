import { createGraphLayout } from '@yugao-gaos/turn-based-grid-sdk/engine';

const CORNER_LIMIT_OFFSET = 3;
const PIT_NODES = ['pit-entrance', 'pit', 'pit-exit'];

export const DEFAULT_LEVEL = Object.freeze({
  trackLength: 24,
  lapsToWin: 3,
  maxFuel: 15,
  maxSpeed: 6,
  maxHandSize: 2,
  cardsPerRefill: 2,
  corners: ['4', '10', '16'],
});

// 技能牌池（占位用，效果后续迭代）
const SKILL_CARDS = [
  { id: 'speed_boost', name: '加速冲刺', description: '本回合速度+2' },
  { id: 'tire_protect', name: '轮胎保护', description: '减少轮胎磨损' },
  { id: 'fuel_save', name: '节能驾驶', description: '本回合油耗减半' },
  { id: 'shortcut', name: '抄近道', description: '跳过前方弯道' },
  { id: 'drafting', name: '尾流加速', description: '跟车时不减速' },
  { id: 'pit_boost', name: '快速维修', description: '进P房时多补油' },
];

let cardInstanceCounter = 0;

function createCardInstance(cardType) {
  cardInstanceCounter += 1;
  return {
    instanceId: `card_${cardInstanceCounter}`,
    id: cardType.id,
    name: cardType.name,
    description: cardType.description,
  };
}

function drawCards(count) {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const cardType = SKILL_CARDS[Math.floor(Math.random() * SKILL_CARDS.length)];
    cards.push(createCardInstance(cardType));
  }
  return cards;
}

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
  edges['0'] = ['1', 'pit-entrance'];
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
function moveOnGraph(level, player, fromNode, distance) {
  if (distance <= 0) {
    return { position: fromNode, lap: player.lap, fuelCost: 0, offTrack: false, stepsTaken: 0 };
  }

  const layout = level.layout;
  let current = fromNode;
  let offTrack = false;
  let lapsGained = 0;
  let stepsTaken = 0;

  for (let step = 0; step < distance; step += 1) {
    const neighbors = layout.neighbors(current);
    if (neighbors.length === 0) break;

    current = neighbors[0];
    stepsTaken += 1;

    // 经过 0 格子时停下，询问是否进入 P 房
    if (current === '0') {
      lapsGained += 1;
      break;
    }

    const limit = level.speedLimits.find((l) => l.at === current);
    if (limit) {
      const cornerIdx = cornerIndexForLimit(level, limit.at);
      if (player.perfectBrake === cornerIdx) continue;

      if (player.speed > limit.limit) {
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
    lap: player.lap + lapsGained,
    fuelCost: lapsGained > 0 ? lapsGained : 0,
    offTrack,
    stepsTaken,
  };
}

// 进入 P 房：直达 P 房格补油，清零骰子和车速，本回合结束
function resolvePitMovement(player, level, isEntering = false) {
  return {
    ...player,
    position: 'pit',
    fuel: level.maxFuel,
    pendingRoll: 0,
    roll: 0,
    speed: 0,
    lastAction: isEntering ? 'enter-pit' : 'end-turn',
    message: 'P房补油完成，本回合结束，下回合从P房正常出发',
    perfectBrake: null,
  };
}

// 从 P 房格或出口出发，沿图正常移动
function resolvePitExitMovement(player, level, pendingRoll) {
  if (player.speed <= 0) {
    return {
      ...player,
      pendingRoll: 0,
      roll: 0,
      lastAction: 'end-turn',
      message: '当前速度为0，无法前进',
    };
  }

  const distance = player.speed;
  const result = moveOnGraph(level, player, player.position, distance);

  let message = `车速 ${distance}，前进 ${distance} 格`;
  if (result.offTrack) {
    message = '冲出赛道！下回合原地停留';
  }

  let nextPlayer = {
    ...player,
    lap: result.lap,
    position: result.position,
    fuel: player.fuel - result.fuelCost,
    pendingRoll: 0,
    roll: pendingRoll,
    speed: result.offTrack ? 0 : player.speed,
    stunTurns: 0,
    offTrack: result.offTrack,
    lastAction: 'end-turn',
    message,
  };

  const landedCorner = level.corners.indexOf(nextPlayer.position);
  nextPlayer = { ...nextPlayer, perfectBrake: landedCorner >= 0 ? landedCorner : null };

  return nextPlayer;
}

// 从0号格沿P房通道前进：0 → pit-entrance → pit → pit-exit → 2
function resolvePitEntryMovement(player, level, pendingRoll) {
  const distance = player.speed;
  const layout = level.layout;
  let current = player.position; // '0'
  let stepsTaken = 0;
  let reachedPit = false;

  for (let step = 0; step < distance; step += 1) {
    const neighbors = layout.neighbors(current);
    if (neighbors.length === 0) break;

    // 从0号格走P房分支（neighbors[1]），其他格子走主方向
    current = current === '0' && neighbors.length > 1 ? neighbors[1] : neighbors[0];
    stepsTaken += 1;

    if (current === 'pit') {
      reachedPit = true;
      break;
    }
  }

  let message = `车速 ${distance}，沿P房通道前进 ${stepsTaken} 格`;
  if (reachedPit) {
    message = '进入P房，补油完毕';
  }

  const nextPlayer = {
    ...player,
    position: current,
    fuel: reachedPit ? level.maxFuel : player.fuel,
    speed: reachedPit ? 0 : player.speed,
    pendingRoll: 0,
    roll: pendingRoll,
    perfectBrake: null,
    pitEntryCommitted: false,
    lastAction: 'end-turn',
    message,
  };

  return nextPlayer;
}

function resolveMovement(player, level, pendingRoll) {
  const distance = player.speed;
  const result = moveOnGraph(level, player, player.position, distance);

  let message = pendingRoll > 0
    ? `车速 ${distance}，前进 ${distance} 格`
    : '匀速前进';
  if (result.offTrack) {
    message = '冲出赛道！下回合原地停留';
  }

  let nextPlayer = {
    ...player,
    lap: result.lap,
    position: result.position,
    fuel: player.fuel - result.fuelCost,
    pendingRoll: 0,
    roll: pendingRoll,
    speed: result.offTrack ? 0 : player.speed,
    stunTurns: 0,
    offTrack: result.offTrack,
    stepsTaken: result.stepsTaken,
    lastAction: 'end-turn',
    message,
  };

  const landedCorner = level.corners.indexOf(nextPlayer.position);
  nextPlayer = { ...nextPlayer, perfectBrake: landedCorner >= 0 ? landedCorner : null };

  return nextPlayer;
}

function addCardActions(actions, player, level) {
  // 技能牌操作已迁移到手牌面板
}

function nextActionList(player, level, status) {
  if (status !== 'playing') return [];
  const actions = [];

  // 在 0 格子等待选择是否进 P 房
  if (player.atPitCrossing) {
    actions.push({ id: 'enter-pit', params: 'none', text: '进入P房' });
    actions.push({ id: 'continue', params: 'none', text: '继续前进' });
    return actions;
  }

  if (player.stunTurns > 0) {
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  if (player.position === 'pit-entrance') {
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    return actions;
  }

  if (player.position === 'pit') {
    if (player.lastAction === 'enter-pit') {
      actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
      return actions;
    }
    if (player.pendingRoll === 0 && !player.hasAdvanced) {
      actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
    }
    actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
    actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
    if (player.speed > 0 && !player.hasAdvanced) {
      actions.push({ id: 'advance', params: 'none', text: '前进' });
    }
    if (player.hasAdvanced) {
      actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    }
    addCardActions(actions, player, level);
    return actions;
  }

  if (player.position === 'pit-exit') {
    if (player.pendingRoll === 0 && !player.hasAdvanced) {
      actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
    }
    actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
    actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
    if (player.speed > 0 && !player.hasAdvanced) {
      actions.push({ id: 'advance', params: 'none', text: '前进' });
    }
    if (player.hasAdvanced) {
      actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
    }
    addCardActions(actions, player, level);
    return actions;
  }

  if (player.position === '0' && player.turn > 0 && !player.pitEntryCommitted) {
    actions.push({ id: 'enter-pit', params: 'none', text: '进入P房' });
  }
  if (player.pendingRoll === 0 && !player.hasAdvanced) {
    actions.push({ id: 'roll-dice', params: 'none', text: '掷骰子' });
  }
  actions.push({ id: 'accelerate', params: 'none', text: '加速（油耗 1，速度+1）' });
  actions.push({ id: 'brake', params: 'none', text: '刹车（速度-1）' });
  if (player.fuel < level.maxFuel) {
    actions.push({ id: 'pit-stop', params: 'none', text: '原地加油' });
  }
  if (player.speed > 0 && !player.hasAdvanced) {
    actions.push({ id: 'advance', params: 'none', text: '前进' });
  }
  if (player.hasAdvanced) {
    actions.push({ id: 'end-turn', params: 'none', text: '回合结束' });
  }
  addCardActions(actions, player, level);
  return actions;
}

function createPlayer(name, level) {
  return {
    name,
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
    atPitCrossing: false,
    remainingSteps: 0,
    hasAdvanced: false,
    spunOut: false,
    pitEntryCommitted: false,
    tireWear: 0,
    hand: [],
    canRefillCards: false,
  };
}

export function createInitialState(level = DEFAULT_LEVEL, seed = 1) {
  const resolvedLevel = normalizeLevel(level);
  const players = [
    createPlayer('玩家1', resolvedLevel),
    createPlayer('玩家2', resolvedLevel),
  ].map((p) => ({ ...p, hand: drawCards(resolvedLevel.cardsPerRefill) }));
  return {
    seed,
    level: resolvedLevel,
    activePlayerIndex: 0,
    players,
    turn: 0,
    status: 'playing',
    message: '比赛准备就绪',
  };
}

// 判断动作是否导致回合结束（需要切换玩家）
function isTurnEndingAction(player, actionId) {
  if (player.stunTurns > 0) return true;
  if (player.position === 'pit' && player.lastAction === 'enter-pit' && actionId === 'end-turn') return true;
  if (player.position === 'pit-entrance' && actionId === 'end-turn') return true;
  if ((player.position === 'pit' || player.position === 'pit-exit') && actionId === 'end-turn') return true;
  if (actionId === 'end-turn') return true;
  if (actionId === 'enter-pit') return true;
  return false;
}

// 检查是否只剩一名玩家存活，若是则该玩家获胜
function checkLastPlayerStanding(state, players) {
  const activePlayers = players.filter((p) => p.status !== 'failed');
  if (activePlayers.length === 1) {
    const winnerIndex = players.indexOf(activePlayers[0]);
    const newPlayers = [...players];
    newPlayers[winnerIndex] = { ...activePlayers[0], status: 'won', message: '其他玩家已退出，获得胜利！' };
    return {
      ...state,
      players: newPlayers,
      status: 'won',
      message: `${activePlayers[0].name}：其他玩家已退出，获得胜利！`,
    };
  }
  return null;
}

export function applyAction(state, action = { id: 'end-turn' }) {
  if (state.status !== 'playing') return state;

  const actionId = action?.id ?? 'end-turn';
  const level = state.level;
  const playerIndex = state.activePlayerIndex;
  const player = state.players[playerIndex];

  // ========== 特殊状态：只能结束回合 ==========

  // P 房格本回合（刚进入 P 房）：只能结束回合
  if (player.position === 'pit' && player.lastAction === 'enter-pit') {
    if (actionId === 'end-turn') {
      const updatedPlayer = {
        ...player,
        pendingRoll: 0,
        roll: 0,
        speed: 0,
        turn: player.turn + 1,
        lastAction: 'end-turn-pit',
        message: 'P房休整完毕，下回合从P房正常出发',
      };
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = updatedPlayer;
      const nextIndex = (playerIndex + 1) % newPlayers.length;
      return {
        ...state,
        players: newPlayers,
        activePlayerIndex: nextIndex,
        turn: state.turn + 1,
        message: `${updatedPlayer.name}：${updatedPlayer.message}`,
      };
    }
    return state;
  }

  // 冲出赛道休整
  if (player.stunTurns > 0) {
    if (actionId === 'end-turn') {
      const updatedPlayer = {
        ...player,
        stunTurns: player.stunTurns - 1,
        pendingRoll: 0,
        roll: 0,
        turn: player.turn + 1,
        lastAction: 'stun',
        message: '冲出赛道后休整一回合',
      };
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = updatedPlayer;
      const nextIndex = (playerIndex + 1) % newPlayers.length;
      return {
        ...state,
        players: newPlayers,
        activePlayerIndex: nextIndex,
        turn: state.turn + 1,
        message: `${updatedPlayer.name}：${updatedPlayer.message}`,
      };
    }
    return state;
  }

  // ========== 非回合结束类动作 ==========

  // 掷骰子（不切换玩家）
  if (actionId === 'roll-dice') {
    if (player.pendingRoll !== 0) return state;
    const result = rollDie(state.seed);
    const updatedPlayer = {
      ...player,
      seed: result.nextSeed,
      pendingRoll: result.value,
      roll: result.value,
      speed: result.value,
      lastAction: 'roll-dice',
      message: `掷出 ${result.value} 点，车速设为 ${result.value}`,
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return {
      ...state,
      seed: result.nextSeed,
      players: newPlayers,
      message: `${updatedPlayer.name}：${updatedPlayer.message}`,
    };
  }

  // 加速（不切换玩家）
  if (actionId === 'accelerate') {
    const speed = Math.min(level.maxSpeed, player.speed + 1);
    const updatedPlayer = {
      ...player,
      speed,
      fuel: player.fuel - 1,
      lastAction: 'accelerate',
      message: '加速准备，车速+1',
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return {
      ...state,
      players: newPlayers,
      message: `${updatedPlayer.name}：${updatedPlayer.message}`,
    };
  }

  // 刹车（不切换玩家）
  if (actionId === 'brake') {
    const speed = Math.max(0, player.speed - 1);
    const updatedPlayer = {
      ...player,
      speed,
      lastAction: 'brake',
      message: '刹车准备，车速-1',
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return {
      ...state,
      players: newPlayers,
      message: `${updatedPlayer.name}：${updatedPlayer.message}`,
    };
  }

  // 原地加油（不切换玩家）
  if (actionId === 'pit-stop') {
    const updatedPlayer = {
      ...player,
      fuel: Math.min(level.maxFuel, player.fuel + 2),
      lastAction: 'pit-stop',
      message: '原地加油',
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return {
      ...state,
      players: newPlayers,
      message: `${updatedPlayer.name}：${updatedPlayer.message}`,
    };
  }

  // ========== 技能牌操作 ==========

  // 补牌：弃掉当前手牌，抽取新牌
  if (actionId === 'refill-cards') {
    if (!player.canRefillCards) return state;
    const updatedPlayer = {
      ...player,
      hand: drawCards(level.cardsPerRefill),
      canRefillCards: false,
      lastAction: 'refill-cards',
      message: '补牌完成',
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return {
      ...state,
      players: newPlayers,
      message: `${updatedPlayer.name}：补牌完成`,
    };
  }

  // 打出技能牌
  if (actionId === 'play-card') {
    const cardId = action?.cardId;
    if (!cardId) return state;
    const cardIndex = player.hand.findIndex((c) => c.instanceId === cardId);
    if (cardIndex < 0) return state;
    const card = player.hand[cardIndex];
    const newHand = [...player.hand];
    newHand.splice(cardIndex, 1);
    const updatedPlayer = {
      ...player,
      hand: newHand,
      lastAction: 'play-card',
      message: `打出技能牌：${card.name}`,
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return {
      ...state,
      players: newPlayers,
      message: `${updatedPlayer.name}：打出技能牌「${card.name}」`,
    };
  }

  // ========== 前进（移动赛车，不切换玩家） ==========

  if (actionId === 'advance') {
    if (player.speed <= 0) return state;
    if (player.hasAdvanced) return state;

    let movedPlayer;
    if (player.pitEntryCommitted) {
      movedPlayer = resolvePitEntryMovement(player, level, player.pendingRoll);
    } else if (player.position === 'pit' || player.position === 'pit-exit') {
      movedPlayer = resolvePitExitMovement(player, level, player.pendingRoll);
    } else {
      movedPlayer = resolveMovement(player, level, player.pendingRoll);
    }

    // 检查是否经过0停下
    if (isOnMainTrack(player.position) && movedPlayer.position === '0' && player.position !== '0' && !movedPlayer.offTrack) {
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = {
        ...movedPlayer,
        atPitCrossing: true,
        remainingSteps: player.speed - (movedPlayer.stepsTaken || 0),
        lastAction: 'stopped-at-zero',
        turn: player.turn,
        canRefillCards: true,
      };
      return { ...state, players: newPlayers, message: `${movedPlayer.name}：到达0号格子，是否进入P房？` };
    }

    // 冲出赛道标记：暂不设 stunTurns，等回合结束时再设，让下一回合成为休整回合
    if (movedPlayer.offTrack) {
      const tireWear = player.tireWear + 1;
      if (tireWear >= 3) {
        const newPlayers = [...state.players];
        newPlayers[playerIndex] = { ...player, tireWear, status: 'failed', message: `轮胎磨损${tireWear}，达到极限，退出比赛` };
        const lastManStanding = checkLastPlayerStanding(state, newPlayers);
        if (lastManStanding) return lastManStanding;
        return { ...state, players: newPlayers, status: 'failed', message: `${player.name}：轮胎磨损${tireWear}，达到极限，退出比赛` };
      }
      movedPlayer = { ...movedPlayer, spunOut: true, tireWear };
    }

    // 跑完一圈标记可补牌
    if (movedPlayer.lap > player.lap) {
      movedPlayer = { ...movedPlayer, canRefillCards: true };
    }

    movedPlayer = { ...movedPlayer, hasAdvanced: true };

    // 油量耗尽检查
    if (movedPlayer.fuel < 0) {
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = { ...movedPlayer, status: 'failed', message: '油量耗尽，退出比赛' };
      const lastManStanding = checkLastPlayerStanding(state, newPlayers);
      if (lastManStanding) return lastManStanding;
      return { ...state, players: newPlayers, status: 'failed', message: `${movedPlayer.name}：油量耗尽，退出比赛` };
    }

    // 获胜检查
    if (movedPlayer.lap >= level.lapsToWin) {
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = { ...movedPlayer, status: 'won', message: '冲过终点，获得胜利！' };
      return { ...state, players: newPlayers, status: 'won', message: `${movedPlayer.name}：冲过终点，获得胜利！` };
    }

    const newPlayers = [...state.players];
    newPlayers[playerIndex] = movedPlayer;
    return { ...state, players: newPlayers, message: `${movedPlayer.name}：${movedPlayer.message}` };
  }

  // ========== 经过0后继续前进（不切换玩家） ==========

  if (player.atPitCrossing && actionId === 'continue') {
    const remainingSteps = player.remainingSteps || 0;
    let updatedPlayer;
    if (remainingSteps <= 0) {
      updatedPlayer = {
        ...player,
        atPitCrossing: false,
        remainingSteps: 0,
        hasAdvanced: true,
        lastAction: 'end-turn',
        message: '前方就是0号格子',
      };
    } else {
      const result = moveOnGraph(level, player, player.position, remainingSteps);
      let message = `继续前进 ${remainingSteps} 格`;
      if (result.offTrack) message = '继续前进时冲出赛道！下回合原地停留';
      const tireWear = result.offTrack ? player.tireWear + 1 : player.tireWear;
      if (tireWear >= 3) {
        const newPlayers = [...state.players];
        newPlayers[playerIndex] = { ...player, tireWear, status: 'failed', message: `轮胎磨损${tireWear}，达到极限，退出比赛` };
        const lastManStanding = checkLastPlayerStanding(state, newPlayers);
        if (lastManStanding) return lastManStanding;
        return { ...state, players: newPlayers, status: 'failed', message: `${player.name}：轮胎磨损${tireWear}，达到极限，退出比赛` };
      }
      updatedPlayer = {
        ...player,
        lap: result.lap,
        position: result.position,
        fuel: player.fuel - result.fuelCost,
        pendingRoll: 0,
        roll: player.roll,
        speed: result.offTrack ? 0 : player.speed,
        stunTurns: 0,
        spunOut: result.offTrack || player.spunOut,
        tireWear,
        atPitCrossing: false,
        remainingSteps: 0,
        hasAdvanced: true,
        lastAction: 'end-turn',
        message,
      };
      const landedCorner = level.corners.indexOf(updatedPlayer.position);
      updatedPlayer = { ...updatedPlayer, perfectBrake: landedCorner >= 0 ? landedCorner : null };
    }

    // 油量/获胜检查
    if (updatedPlayer.fuel < 0) {
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = { ...updatedPlayer, status: 'failed', message: '油量耗尽，退出比赛' };
      const lastManStanding = checkLastPlayerStanding(state, newPlayers);
      if (lastManStanding) return lastManStanding;
      return { ...state, players: newPlayers, status: 'failed', message: `${updatedPlayer.name}：油量耗尽，退出比赛` };
    }
    if (updatedPlayer.lap >= level.lapsToWin) {
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = { ...updatedPlayer, status: 'won', message: '冲过终点，获得胜利！' };
      return { ...state, players: newPlayers, status: 'won', message: `${updatedPlayer.name}：冲过终点，获得胜利！` };
    }

    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return { ...state, players: newPlayers, message: `${updatedPlayer.name}：${updatedPlayer.message}` };
  }

  // ========== 经过0后进入P房通道（不切换玩家） ==========

  if (player.atPitCrossing && actionId === 'enter-pit') {
    const remainingSteps = player.remainingSteps || 0;

    // 没有剩余步数，标记承诺进入P房，结束当前回合
    if (remainingSteps <= 0) {
      const updatedPlayer = {
        ...player,
        atPitCrossing: false,
        pitEntryCommitted: true,
        hasAdvanced: true,
        lastAction: 'commit-pit-entry',
        message: '确定进入P房，下回合从P房通道进入',
      };
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = updatedPlayer;
      return { ...state, players: newPlayers, message: `${updatedPlayer.name}：${updatedPlayer.message}` };
    }

    // 有剩余步数，沿P房通道逐格移动
    const layout = level.layout;
    let currentPos = player.position; // '0'
    let reachedPit = false;

    for (let step = 0; step < remainingSteps; step += 1) {
      const neighbors = layout.neighbors(currentPos);
      if (neighbors.length === 0) break;

      // 从0号格走P房分支（neighbors[1]），其他格子走主方向
      currentPos = currentPos === '0' && neighbors.length > 1 ? neighbors[1] : neighbors[0];

      if (currentPos === 'pit') {
        reachedPit = true;
        break;
      }
    }

    if (reachedPit) {
      const updatedPlayer = {
        ...player,
        position: 'pit',
        fuel: level.maxFuel,
        speed: 0,
        pendingRoll: 0,
        roll: 0,
        perfectBrake: null,
        atPitCrossing: false,
        remainingSteps: 0,
        hasAdvanced: true,
        lastAction: 'enter-pit',
        message: '进入P房，补油完毕，请点击回合结束',
      };
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = updatedPlayer;
      return { ...state, players: newPlayers, message: `${updatedPlayer.name}：${updatedPlayer.message}` };
    }

    // 步数不足未到达P房，停在P房通道中
    const updatedPlayer = {
      ...player,
      position: currentPos,
      atPitCrossing: false,
      remainingSteps: 0,
      hasAdvanced: true,
      lastAction: 'enter-pit-lane',
      message: `进入P房通道，当前在${currentPos}，剩余步数不足`,
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    return { ...state, players: newPlayers, message: `${updatedPlayer.name}：${updatedPlayer.message}` };
  }

  // ========== 回合结束（切换玩家） ==========

  if (actionId === 'end-turn') {
    // P 房入口
    if (player.position === 'pit-entrance') {
      const updatedPlayer = {
        ...resolvePitMovement(player, level),
        turn: player.turn + 1,
      };
      const newPlayers = [...state.players];
      newPlayers[playerIndex] = updatedPlayer;
      const nextIndex = (playerIndex + 1) % newPlayers.length;
      return {
        ...state,
        players: newPlayers,
        activePlayerIndex: nextIndex,
        turn: state.turn + 1,
        message: `${updatedPlayer.name}：${updatedPlayer.message}`,
      };
    }

    // 普通情况：必须已前进
    if (!player.hasAdvanced) return state;

    // 如果本回合冲出赛道，下回合为休整回合
    const isSpunOut = player.spunOut;
    const updatedPlayer = {
      ...player,
      hasAdvanced: false,
      pendingRoll: 0,
      roll: 0,
      stunTurns: isSpunOut ? 1 : 0,
      spunOut: false,
      turn: player.turn + 1,
      lastAction: 'end-turn',
      message: isSpunOut ? '冲出赛道，下回合休整' : '回合结束',
    };
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;
    const nextIndex = (playerIndex + 1) % newPlayers.length;
    return {
      ...state,
      players: newPlayers,
      activePlayerIndex: nextIndex,
      turn: state.turn + 1,
      message: `${updatedPlayer.name}：回合结束`,
    };
  }

  return state;
}

export function stateToView(state) {
  const activePlayer = state.players[state.activePlayerIndex];
  const level = state.level;
  return {
    status: state.status,
    activeSeat: `driver-${state.activePlayerIndex + 1}`,
    activePlayerIndex: state.activePlayerIndex,
    activePlayerName: activePlayer?.name,
    actions: nextActionList(activePlayer, level, state.status),
    hud: {
      actionsUsed: state.turn,
      items: [],
    },
    race: {
      lap: activePlayer?.lap,
      lapsToWin: level.lapsToWin,
      position: activePlayer?.position,
      trackLength: level.trackLength,
      speed: activePlayer?.speed,
      fuel: activePlayer?.fuel,
      pendingRoll: activePlayer?.pendingRoll,
      roll: activePlayer?.roll,
      perfectBrake: activePlayer?.perfectBrake,
      stunTurns: activePlayer?.stunTurns,
      tireWear: activePlayer?.tireWear ?? 0,
      hand: activePlayer?.hand ?? [],
      canRefillCards: activePlayer?.canRefillCards ?? false,
      isOnPit: activePlayer ? !isOnMainTrack(activePlayer.position) : false,
      lastAction: activePlayer?.lastAction,
      message: state.message,
      corners: level.corners,
      speedLimits: level.speedLimits,
      trackNodes: level.nodes.filter(isOnMainTrack),
      pitNodes: level.pitNodes,
      players: state.players.map((p, i) => ({
        index: i,
        name: p.name,
        lap: p.lap,
        position: p.position,
        speed: p.speed,
        fuel: p.fuel,
        stunTurns: p.stunTurns,
        tireWear: p.tireWear ?? 0,
        hand: p.hand ?? [],
        isOnPit: !isOnMainTrack(p.position),
        isActive: i === state.activePlayerIndex,
      })),
    },
  };
}
