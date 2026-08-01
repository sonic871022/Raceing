const els = {
  status: document.getElementById('status'),
  activePlayer: document.getElementById('active-player'),
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
  playersInfo: document.getElementById('players-info'),
};

const CAR_ICONS = ['🏎️', '🚙'];

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
  const { trackLength, corners, speedLimits, pitTrackCells, pitNodes, players } = view.race;
  const limitMap = new Map((speedLimits || []).map((l) => [l.at, l.limit]));

  // P房通道
  els.pitLane.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'pit-lane-label';
  label.textContent = 'P房';
  els.pitLane.appendChild(label);

  const pitLaneCells = [
    { key: 'pit-entrance', text: '入', type: 'channel' },
    { key: 'pit', text: 'P', type: 'pit' },
    { key: 'pit-exit', text: '出', type: 'channel' },
  ];

  pitLaneCells.forEach((p) => {
    const cell = document.createElement('div');
    cell.className = `pit-cell ${p.type}`;
    cell.textContent = p.text;

    // 显示所有在 P 房通道的赛车
    players.forEach((pl, idx) => {
      if (pl.position === p.key) {
        const car = document.createElement('span');
        car.className = `car car-${idx}`;
        car.textContent = CAR_ICONS[idx];
        cell.appendChild(car);
      }
    });

    els.pitLane.appendChild(cell);
  });

  // 主赛道
  els.track.innerHTML = '';
  for (let i = 0; i < trackLength; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const cellId = String(i);
    if (corners.includes(cellId)) cell.classList.add('corner');
    if (limitMap.has(cellId)) cell.classList.add('limit');
    if (cellId === '0' || cellId === '2') cell.classList.add('green');

    const index = document.createElement('span');
    index.className = 'index';
    index.textContent = i;
    cell.appendChild(index);

    // 显示所有在主赛道上的赛车
    let carAdded = false;
    players.forEach((pl, idx) => {
      if (pl.position === cellId) {
        const car = document.createElement('span');
        car.className = `car car-${idx}`;
        car.textContent = CAR_ICONS[idx];
        cell.appendChild(car);
        carAdded = true;
      }
    });

    if (!carAdded && limitMap.has(cellId)) {
      const limitText = document.createElement('span');
      limitText.className = 'limit-text';
      limitText.textContent = limitMap.get(cellId);
      cell.appendChild(limitText);
    }

    els.track.appendChild(cell);
  }
}

function renderHud(state, view) {
  const r = view.race;
  els.activePlayer.textContent = r.players[state.activePlayerIndex]?.name || '-';
  els.activePlayer.className = `active-player player-${state.activePlayerIndex}`;
  els.lap.textContent = `${r.lap} / ${r.lapsToWin}`;
  els.position.textContent = r.position;
  els.speed.textContent = r.speed;
  els.fuel.textContent = r.fuel;
  els.roll.textContent = r.pendingRoll > 0 ? r.pendingRoll : '-';
  els.perfectBrake.textContent =
    r.perfectBrake !== null && r.perfectBrake !== undefined ? '生效' : '-';
  els.stunTurns.textContent = r.stunTurns > 0 ? r.stunTurns : '-';
  els.turn.textContent = state.turn;
  els.message.textContent = state.message || '-';

  // 玩家信息面板
  els.playersInfo.innerHTML = '';
  r.players.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = `player-info ${p.isActive ? 'active' : ''} player-${idx}`;
    item.innerHTML = `
      <span class="player-icon">${CAR_ICONS[idx]}</span>
      <span class="player-name">${p.name}</span>
      <span class="player-stat">圈${p.lap}/${r.lapsToWin}</span>
      <span class="player-stat">位${p.position}</span>
      <span class="player-stat">速${p.speed}</span>
      <span class="player-stat">油${p.fuel}</span>
      ${p.stunTurns > 0 ? '<span class="player-stun">休整</span>' : ''}
    `;
    els.playersInfo.appendChild(item);
  });

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

    // 为"前进"和"回合结束"按钮添加特定样式
    if (action.id === 'advance') {
      button.className = 'btn-advance';
    } else if (action.id === 'end-turn') {
      button.className = 'btn-end-turn';
    }

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
