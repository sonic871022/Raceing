const els = {
  status: document.getElementById('status'),
  lap: document.getElementById('lap'),
  position: document.getElementById('position'),
  speed: document.getElementById('speed'),
  fuel: document.getElementById('fuel'),
  roll: document.getElementById('roll'),
  perfectBrake: document.getElementById('perfect-brake'),
  stunTurns: document.getElementById('stun-turns'),
  turn: document.getElementById('turn'),
  pitLane: document.getElementById('pit-lane'),
  track: document.getElementById('track'),
  actions: document.getElementById('actions'),
  message: document.getElementById('message'),
  reset: document.getElementById('reset'),
};

async function fetchState() {
  const response = await fetch('/state');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function submitAction(id) {
  const response = await fetch('/advance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function resetGame() {
  const response = await fetch('/reset', { method: 'POST' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderTrack(state, view) {
  const { trackNodes, pitNodes, corners, speedLimits, isOnPit } = view.race;
  const position = state.position;
  const limitMap = new Map((speedLimits || []).map((l) => [l.at, l.limit]));
  const cornerSet = new Set(corners || []);
  const pitEntrySet = new Set(['0', '2']); // P 房入口/出口连接格

  // P 房通道
  els.pitLane.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'pit-lane-label';
  label.textContent = 'P房';
  els.pitLane.appendChild(label);

  const pitLaneLabels = { 'pit-entrance': '入', 'pit': 'P', 'pit-exit': '出' };
  (pitNodes || []).forEach((nodeId) => {
    const cell = document.createElement('div');
    cell.className = nodeId === 'pit' ? 'pit-cell pit' : 'pit-cell channel';
    cell.textContent = pitLaneLabels[nodeId] || nodeId;

    if (position === nodeId) {
      const car = document.createElement('span');
      car.className = 'car';
      car.textContent = '🏎️';
      cell.appendChild(car);
    }
    els.pitLane.appendChild(cell);
  });

  // 主赛道
  els.track.innerHTML = '';
  (trackNodes || []).forEach((nodeId) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (cornerSet.has(nodeId)) cell.classList.add('corner');
    if (limitMap.has(nodeId)) cell.classList.add('limit');
    if (pitEntrySet.has(nodeId)) cell.classList.add('pit');

    const index = document.createElement('span');
    index.className = 'index';
    index.textContent = nodeId;
    cell.appendChild(index);

    if (!isOnPit && position === nodeId) {
      const car = document.createElement('span');
      car.className = 'car';
      car.textContent = '🏎️';
      cell.appendChild(car);
    } else if (limitMap.has(nodeId)) {
      const limitText = document.createElement('span');
      limitText.className = 'limit-text';
      limitText.textContent = limitMap.get(nodeId);
      cell.appendChild(limitText);
    }

    els.track.appendChild(cell);
  });
}

function renderHud(state, view) {
  els.lap.textContent = `${state.lap} / ${view.race.lapsToWin}`;
  els.position.textContent = view.race.isOnPit
    ? state.position
    : `${state.position} / ${view.race.trackLength - 1}`;
  els.speed.textContent = state.speed;
  els.fuel.textContent = state.fuel;
  els.roll.textContent = state.pendingRoll > 0 ? state.pendingRoll : '-';
  els.perfectBrake.textContent =
    state.perfectBrake !== null && state.perfectBrake !== undefined ? '生效' : '-';
  els.stunTurns.textContent = state.stunTurns > 0 ? state.stunTurns : '-';
  els.turn.textContent = state.turn;
  els.message.textContent = state.message || '-';

  const statusMap = {
    playing: { text: '进行中', className: 'status-playing' },
    won: { text: '获胜', className: 'status-won' },
    failed: { text: '失败', className: 'status-failed' },
  };
  const statusInfo = statusMap[state.status] || { text: state.status, className: '' };
  els.status.textContent = statusInfo.text;
  els.status.className = statusInfo.className;
}

function renderActions(view) {
  els.actions.innerHTML = '';

  const isPlaying = view.status === 'playing';
  for (const action of view.actions) {
    const button = document.createElement('button');
    button.textContent = action.text || action.id;
    button.disabled = !isPlaying;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await submitAction(action.id);
        await refresh();
      } catch (error) {
        els.message.textContent = `提交失败：${error.message}`;
      }
    });
    els.actions.appendChild(button);
  }
}

async function refresh() {
  try {
    const { state, view } = await fetchState();
    renderHud(state, view);
    renderTrack(state, view);
    renderActions(view);
  } catch (error) {
    els.message.textContent = `拉取状态失败：${error.message}`;
  }
}

els.reset.addEventListener('click', async () => {
  try {
    await resetGame();
    await refresh();
  } catch (error) {
    els.message.textContent = `重置失败：${error.message}`;
  }
});

refresh();
