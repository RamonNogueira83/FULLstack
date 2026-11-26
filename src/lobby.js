import { socket } from './network.js';
import { PLAYER_SKINS } from './game/playerAppearance.js';

const root = document.querySelector('#lobby-root');
let identity = null;
let currentRoom = null;
let lobbyState = 'entry';
let guestNickname = '';

if (!(root instanceof HTMLElement)) {
  throw new Error('A interface do lobby não foi encontrada.');
}

root.innerHTML = `
  <section class="lobby-screen" aria-live="polite">
    <header class="lobby-brand">
      <p class="eyebrow">PROTOCOLO // ARENA ONLINE</p>
      <h1>RETRO <span>FPS</span></h1>
      <p class="brand-caption">ENTRE NA PARTIDA. ESCOLHA SEU LADO.</p>
    </header>
    <div class="lobby-card" id="lobby-content"></div>
    <p class="lobby-status" id="lobby-status" role="status"></p>
  </section>
`;

const content = root.querySelector('#lobby-content');
const status = root.querySelector('#lobby-status');

function showStatus(message = '', isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function renderEntry() {
  lobbyState = 'entry';
  currentRoom = null;
  content.innerHTML = `
    <p class="eyebrow">IDENTIFICAÇÃO DO JOGADOR</p>
    <h2>ENTRAR NO COMBATE</h2>
    <form id="login-form" class="lobby-form">
      <label>Nick ou email<input name="identifier" autocomplete="username" required maxlength="254"></label>
      <label>Senha<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label>
      <button class="primary-button" type="submit">FAZER LOGIN</button>
    </form>
    <div class="entry-actions">
      <button class="text-button" id="register-button" type="button">Criar conta</button>
      <span>ou</span>
      <button class="text-button" id="guest-button" type="button">Entrar como visitante</button>
    </div>
  `;
  content.querySelector('#login-form').addEventListener('submit', login);
  content.querySelector('#register-button').addEventListener('click', renderRegistration);
  content.querySelector('#guest-button').addEventListener('click', renderGuestEntry);
}

function renderRegistration() {
  content.innerHTML = `
    <button class="back-button" id="back-button" type="button">← VOLTAR</button>
    <p class="eyebrow">NOVA CONTA</p>
    <h2>CRIAR JOGADOR</h2>
    <form id="register-form" class="lobby-form">
      <label>Nick<input name="nickname" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+"></label>
      <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
      <label>Senha <small>(12 a 128 caracteres)</small><input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label>
      <button class="primary-button" type="submit">CRIAR CONTA</button>
    </form>
  `;
  content.querySelector('#back-button').addEventListener('click', renderEntry);
  content.querySelector('#register-form').addEventListener('submit', register);
}

function renderGuestEntry() {
  content.innerHTML = `
    <button class="back-button" id="back-button" type="button">← VOLTAR</button>
    <p class="eyebrow">ACESSO RÁPIDO</p>
    <h2>JOGAR COMO VISITANTE</h2>
    <form id="guest-form" class="lobby-form">
      <label>Nick<input name="nickname" autocomplete="nickname" required minlength="1" maxlength="20" pattern="[A-Za-zÀ-ÿ0-9_\\- ]+"></label>
      <button class="primary-button" type="submit">CONTINUAR</button>
    </form>
    <p class="form-hint">O visitante não precisa de conta. Seu nick vale apenas nesta conexão.</p>
  `;
  content.querySelector('#back-button').addEventListener('click', renderEntry);
  content.querySelector('#guest-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    guestNickname = String(form.get('nickname')).trim();
    connectToLobby();
  });
}

async function submitAuth(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Não foi possível autenticar.');
  return result;
}

async function login(event) {
  event.preventDefault();
  const button = content.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    await submitAuth('/api/auth/login', {
      identifier: form.get('identifier'),
      password: form.get('password'),
    });
    connectToLobby();
  } catch (error) {
    showStatus(error.message, true);
    button.disabled = false;
  }
}

async function register(event) {
  event.preventDefault();
  const button = content.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    await submitAuth('/api/auth/register', {
      nickname: form.get('nickname'),
      email: form.get('email'),
      password: form.get('password'),
    });
    showStatus('Conta criada. Agora entre com seu nick/email e senha.');
    renderEntry();
  } catch (error) {
    showStatus(error.message, true);
    button.disabled = false;
  }
}

function initializeSocket() {
  if (socket.connected) return;
  socket.connect();
}

function emitWithAck(eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error('Conexão com o servidor perdida.'));
      return;
    }
    socket.timeout(5000).emit(eventName, payload, (timeoutError, result) => {
      if (timeoutError) {
        reject(new Error('O servidor não respondeu. Tente novamente.'));
      } else if (result?.error) {
        reject(new Error(result.error));
      } else {
        resolve(result);
      }
    });
  });
}

function connectToLobby() {
  lobbyState = 'connecting';
  content.innerHTML = `
    <p class="eyebrow">CONECTANDO À ARENA</p>
    <h2>AGUARDE...</h2>
    <div class="loading-mark" aria-hidden="true"></div>
  `;
  showStatus('');
  initializeSocket();
  if (socket.connected) initializeIdentity();
}

async function initializeIdentity() {
  try {
    const result = await emitWithAck('identity:initialize', { nickname: guestNickname });
    identity = result.identity;
    showRoomBrowser();
  } catch (error) {
    showStatus(error.message, true);
    renderEntry();
  }
}

function roomRows(rooms) {
  if (!rooms.length) return '<p class="empty-state">Nenhuma sala aberta. Crie a primeira partida.</p>';
  return rooms.map((room) => `
    <article class="room-row">
      <div>
        <strong>${escapeHtml(room.name)}</strong>
        <small>${room.id} · ${room.playerCount}/${room.capacity} JOGADORES · ${room.teamKills.inter} × ${room.teamKills.gremio} · META ${room.killTarget} ${room.matchStatus === 'finished' ? '· ENCERRADA' : room.hasPassword ? '· 🔒' : '· ABERTA'}</small>
      </div>
      <button class="join-room-button" data-room-id="${room.id}" type="button" ${room.playerCount >= room.capacity ? 'disabled' : ''}>
        ${room.playerCount >= room.capacity ? 'CHEIA' : 'ENTRAR'}
      </button>
    </article>
  `).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function showRoomBrowser() {
  lobbyState = 'rooms';
  currentRoom = null;
  content.innerHTML = `
    <div class="room-header">
      <div><p class="eyebrow">JOGADOR // ${escapeHtml(identity.nickname)}</p><h2>SALAS ONLINE</h2></div>
      <button class="text-button" id="logout-button" type="button">${identity.authenticated ? 'SAIR DA CONTA' : 'TROCAR NICK'}</button>
    </div>
    <div class="room-browser">
      <section class="room-list-panel">
        <div class="section-title"><h3>PARTIDAS DISPONÍVEIS</h3><button class="icon-button" id="refresh-rooms" type="button" aria-label="Atualizar">↻</button></div>
        <div id="room-list" class="room-list"><p class="empty-state">Carregando salas...</p></div>
      </section>
      <section class="create-room-panel">
        <p class="eyebrow">NOVA PARTIDA</p><h3>CRIAR SALA</h3>
        <form id="create-room-form" class="lobby-form">
          <label>Nome da sala<input name="name" required minlength="3" maxlength="24" value="${escapeHtml(identity.nickname)} - Sala"></label>
          <label>Proteção da sala
            <select name="protection"><option value="open">Sem senha</option><option value="locked">Com senha</option></select>
          </label>
          <label id="room-password-field" hidden>Senha da sala <small>(4 a 32 caracteres)</small><input name="password" type="password" minlength="4" maxlength="32" autocomplete="new-password"></label>
          <label>Meta de eliminações por equipe
            <select name="killTarget" required>
              <option value="20" selected>20 eliminações</option>
              <option value="30">30 eliminações</option>
              <option value="50">50 eliminações</option>
            </select>
          </label>
          <button class="primary-button" type="submit">CRIAR E ENTRAR</button>
        </form>
        <p class="form-hint">Até 6 jogadores · máximo de 3 por time.</p>
      </section>
    </div>
  `;
  content.querySelector('#logout-button').addEventListener('click', async () => {
    if (identity.authenticated) {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    }
    socket.disconnect();
    identity = null;
    guestNickname = '';
    renderEntry();
  });
  content.querySelector('#refresh-rooms').addEventListener('click', refreshRooms);
  content.querySelector('select[name="protection"]').addEventListener('change', (event) => {
    const passwordField = content.querySelector('#room-password-field');
    const passwordInput = passwordField.querySelector('input');
    passwordField.hidden = event.target.value !== 'locked';
    passwordInput.required = event.target.value === 'locked';
    if (!passwordInput.required) passwordInput.value = '';
  });
  content.querySelector('#create-room-form').addEventListener('submit', createRoom);
  content.querySelector('#room-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-room-id]');
    if (button && !button.disabled) joinRoom(button.dataset.roomId);
  });
  refreshRooms();
}

async function refreshRooms() {
  try {
    const result = await emitWithAck('rooms:list');
    latestRooms = result.rooms;
    const roomList = content.querySelector('#room-list');
    if (roomList) roomList.innerHTML = roomRows(result.rooms);
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function createRoom(event) {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    const password = form.get('protection') === 'locked' ? form.get('password') : '';
    const result = await emitWithAck('room:create', {
      name: form.get('name'),
      password,
      killTarget: Number(form.get('killTarget')),
    });
    showRoom(result.state);
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function joinRoom(roomId) {
  const room = latestRooms.find((entry) => entry.id === roomId);
  let password = '';
  if (room?.hasPassword) {
    password = window.prompt(`Digite a senha da sala ${room.name}:`) ?? '';
    if (!password) return;
  }
  try {
    const result = await emitWithAck('room:join', { roomId, password });
    showRoom(result.state);
  } catch (error) {
    showStatus(error.message, true);
  }
}

let latestRooms = [];

function showRoom(state) {
  currentRoom = state.room;
  lobbyState = 'room';
  showStatus('');
  content.innerHTML = `
    <button class="back-button" id="leave-room" type="button">← SALAS</button>
    <div class="room-header lobby-room-header">
      <div><p class="eyebrow">SALA // ${escapeHtml(state.room.id)} · META ${state.room.killTarget} · ${state.match.status === 'finished' ? 'ENCERRADA' : state.room.hasPassword ? 'PRIVADA' : 'ABERTA'}</p><h2>${escapeHtml(state.room.name)}</h2></div>
      <span class="player-capacity" id="player-capacity">${state.players.length}/6 JOGADORES</span>
    </div>
    <p class="room-match-status" id="room-match-status"></p>
    <div class="team-grid">
      <section class="team-card team-inter">
        <div class="team-heading"><span class="team-emblem">I</span><div><h3>INTERNACIONAL</h3><p>COLORADOS · VERMELHO</p></div><b id="inter-count">0/3</b></div>
        <ul id="inter-players" class="team-players"></ul>
        <button class="team-select" data-team="inter" type="button">JOGAR PELO INTER</button>
      </section>
      <section class="team-card team-gremio">
        <div class="team-heading"><span class="team-emblem">G</span><div><h3>GRÊMIO</h3><p>TRICOLOR · AZUL</p></div><b id="gremio-count">0/3</b></div>
        <ul id="gremio-players" class="team-players"></ul>
        <button class="team-select" data-team="gremio" type="button">JOGAR PELO GRÊMIO</button>
      </section>
    </div>
    <section class="skin-picker" aria-labelledby="skin-picker-title">
      <div class="skin-picker-heading">
        <div><p class="eyebrow">IDENTIDADE DE COMBATE</p><h3 id="skin-picker-title">ESCOLHA SUA SKIN</h3></div>
        <small>PERSONAGENS ORIGINAIS</small>
      </div>
      <div class="skin-options">
        ${PLAYER_SKINS.map((skin) => `
          <button class="skin-option" data-skin-id="${skin.id}" type="button" aria-pressed="false"
            style="--skin-body:${skin.body};--skin-armor:${skin.armor};--skin-accent:${skin.accent}">
            <span class="skin-swatch" aria-hidden="true"><i></i><b></b></span>
            <span class="skin-option-copy"><strong>${skin.name}</strong><small>${skin.style}</small></span>
            <span class="skin-check" aria-hidden="true">✓</span>
          </button>
        `).join('')}
      </div>
    </section>
    <div class="lobby-room-footer">
      <p>Meta do confronto: <strong>${state.room.killTarget} eliminações para a equipe vencer.</strong> Limite de 3 jogadores por time.</p>
      <button class="primary-button" id="enter-arena" type="button">ENTRAR NA ARENA (TESTE)</button>
    </div>
  `;
  content.querySelector('#leave-room').addEventListener('click', leaveRoom);
  content.querySelectorAll('.team-select').forEach((button) => {
    button.addEventListener('click', () => chooseTeam(button.dataset.team));
  });
  content.querySelectorAll('.skin-option').forEach((button) => {
    button.addEventListener('click', () => chooseSkin(button.dataset.skinId));
  });
  content.querySelector('#enter-arena').addEventListener('click', () => {
    emitWithAck('game:enter').then((result) => {
      root.hidden = true;
      document.dispatchEvent(new CustomEvent('lobby:enter-arena', {
        detail: result,
      }));
    }).catch((error) => showStatus(error.message, true));
  });
  content.querySelector('#enter-arena').disabled = state.match.status === 'finished';
  if (state.match.status === 'finished') {
    showStatus(`Partida encerrada: ${state.match.winner === 'inter' ? 'Internacional' : 'Grêmio'} venceu.`);
  }
  renderRoomState(state);
}

function renderRoomState(state) {
  if (lobbyState !== 'room' || state.room.id !== currentRoom?.id) return;
  currentRoom = state.room;
  for (const team of ['inter', 'gremio']) {
    const players = state.teams[team];
    const list = content.querySelector(`#${team}-players`);
    const count = content.querySelector(`#${team}-count`);
    if (!list || !count) return;
    count.textContent = `${players.length}/3`;
    list.innerHTML = players.length
      ? players.map((player) => `
        <li class="${player.id === identity.id ? 'is-self' : ''}">
          <span>${escapeHtml(player.nickname)}${player.id === identity.id ? ' (VOCÊ)' : ''}<small class="player-skin-name">${escapeHtml(PLAYER_SKINS.find((skin) => skin.id === player.skinId)?.name ?? PLAYER_SKINS[0].name)}</small></span>
          ${player.isHost ? '<small>HOST</small>' : ''}
        </li>
      `).join('')
      : '<li class="empty-team">Aguardando jogador...</li>';
    const button = content.querySelector(`.team-select[data-team="${team}"]`);
    button.disabled = players.length >= 3 && !players.some((player) => player.id === identity.id);
    button.classList.toggle('is-selected', players.some((player) => player.id === identity.id));
    button.textContent = players.some((player) => player.id === identity.id)
      ? 'TIME SELECIONADO'
      : `JOGAR PELO ${team === 'inter' ? 'INTER' : 'GRÊMIO'}`;
  }
  const self = state.players.find((player) => player.id === identity.id);
  content.querySelectorAll('.skin-option').forEach((button) => {
    const selected = button.dataset.skinId === self?.skinId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  content.querySelector('#player-capacity').textContent = `${state.players.length}/6 JOGADORES`;
  const matchStatus = content.querySelector('#room-match-status');
  matchStatus.textContent = state.match.status === 'finished'
    ? `Partida encerrada · ${state.match.winner === 'inter' ? 'Internacional' : 'Grêmio'} venceu (${state.match.teamKills.inter} × ${state.match.teamKills.gremio}).`
    : `Meta ${state.match.killTarget} eliminações · Inter ${state.match.teamKills.inter} × ${state.match.teamKills.gremio} Grêmio${state.match.status === 'running' ? ' · partida em andamento' : ''}`;
  content.querySelector('#enter-arena').disabled = state.match.status === 'finished';
}

async function chooseTeam(team) {
  try {
    const result = await emitWithAck('room:choose-team', { team });
    renderRoomState(result.state);
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function chooseSkin(skinId) {
  try {
    const result = await emitWithAck('player:choose-skin', { skinId });
    renderRoomState(result.state);
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function leaveRoom() {
  try {
    if (lobbyState === 'room') {
      await emitWithAck('game:leave');
    }
    await emitWithAck('room:leave');
    showStatus('');
    showRoomBrowser();
  } catch (error) {
    showStatus(error.message, true);
  }
}

socket.on('connect', () => {
  if (lobbyState === 'connecting') initializeIdentity();
});
socket.on('connect_error', () => {
  showStatus('Não foi possível conectar ao servidor. Verifique se o backend está ativo.', true);
  renderEntry();
});
socket.on('rooms:list', (rooms) => {
  latestRooms = rooms;
  const roomList = content.querySelector('#room-list');
  if (roomList && lobbyState === 'rooms') roomList.innerHTML = roomRows(rooms);
});
socket.on('room:state', renderRoomState);

renderEntry();
fetch('/api/auth/me', { credentials: 'same-origin' })
  .then((response) => {
    if (response.ok) {
      lobbyState = 'connecting';
      content.innerHTML = '<p class="eyebrow">SESSÃO ATIVA</p><h2>CONECTANDO...</h2>';
      initializeSocket();
    }
  })
  .catch(() => {});
