import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { attachRoomHandlers } from '../server/rooms.js';
import { DEFAULT_SKIN_ID, PLAYER_SKINS } from '../src/game/playerAppearance.js';

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

async function connectClient(url, nickname, { cookie, expectedNickname = nickname } = {}) {
  const socket = createClient(url, {
    transports: ['websocket'],
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  const identity = await emitAck(socket, 'identity:initialize', { nickname });
  assert.equal(identity.identity.nickname, expectedNickname);
  return socket;
}

test('rooms enforce passwords, team capacity, live team changes, and player limit', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'retro-fps-rooms-'));
  const { app, close, resolveSession } = createApp({
    databasePath: path.join(directory, 'players.sqlite'),
  });
  const server = createServer(app);
  const io = new Server(server);
  attachRoomHandlers(io, { resolveSession });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const clients = [];

  try {
    await fetch(`${url}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nickname: 'AuthHost',
        email: 'host@example.com',
        password: 'a secure test password',
      }),
    });
    const login = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'AuthHost',
        password: 'a secure test password',
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);

    const host = await connectClient(url, 'Impostor', {
      cookie,
      expectedNickname: 'AuthHost',
    });
    clients.push(host);
    const created = await emitAck(host, 'room:create', {
      name: 'Sala fechada',
      password: 'senha-forte',
      killTarget: 30,
    });
    assert.equal(created.state.teams.inter.length, 1);
    assert.equal(created.state.players[0].skinId, DEFAULT_SKIN_ID);
    assert.equal(created.state.room.hasPassword, true);
    assert.equal(created.state.room.killTarget, 30);
    assert.equal(created.state.match.status, 'waiting');

    const wrongPasswordPlayer = await connectClient(url, 'WrongPass');
    clients.push(wrongPasswordPlayer);
    const wrongPassword = await emitAck(wrongPasswordPlayer, 'room:join', {
      roomId: created.state.room.id,
      password: 'senha-errada',
    });
    assert.match(wrongPassword.error, /Senha da sala incorreta/);

    const joiner = await connectClient(url, 'Joiner');
    clients.push(joiner);
    const joined = await emitAck(joiner, 'room:join', {
      roomId: created.state.room.id,
      password: 'senha-forte',
    });
    assert.equal(joined.state.teams.gremio.length, 1);
    assert.equal(joined.state.players.find((player) => player.nickname === 'Joiner').skinId, DEFAULT_SKIN_ID);

    const changedSkin = await emitAck(joiner, 'player:choose-skin', {
      skinId: PLAYER_SKINS[1].id,
    });
    assert.equal(
      changedSkin.state.players.find((player) => player.nickname === 'Joiner').skinId,
      PLAYER_SKINS[1].id,
    );
    const invalidSkin = await emitAck(joiner, 'player:choose-skin', {
      skinId: 'unreleased-character',
    });
    assert.match(invalidSkin.error, /skin disponível/);

    const moved = await emitAck(joiner, 'room:choose-team', { team: 'inter' });
    assert.equal(moved.state.teams.inter.length, 2);
    assert.equal(moved.state.teams.gremio.length, 0);

    for (let index = 0; index < 4; index += 1) {
      const client = await connectClient(url, `Player${index}`);
      clients.push(client);
      const result = await emitAck(client, 'room:join', {
        roomId: created.state.room.id,
        password: 'senha-forte',
      });
      assert.equal(result.state.players.length, index + 3);
    }

    const roomState = await emitAck(host, 'room:choose-team', { team: 'inter' });
    assert.equal(roomState.state.teams.inter.length, 3);
    assert.equal(roomState.state.teams.gremio.length, 3);

    const tooMany = await connectClient(url, 'PlayerSix');
    clients.push(tooMany);
    const fullRoomResult = await emitAck(tooMany, 'room:join', {
      roomId: created.state.room.id,
      password: 'senha-forte',
    });
    assert.match(fullRoomResult.error, /sala está cheia/);

    const forbiddenTeam = await emitAck(host, 'room:choose-team', { team: 'other' });
    assert.match(forbiddenTeam.error, /trocar de time/);
  } finally {
    clients.forEach((client) => client.disconnect());
    await new Promise((resolve) => io.close(resolve));
    close();
    await rm(directory, { recursive: true, force: true });
  }
});
