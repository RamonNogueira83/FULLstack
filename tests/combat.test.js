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
import { PLAYER_MODEL } from '../src/game/playerAppearance.js';

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

async function connectGuest(url, nickname) {
  const socket = createClient(url, { transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  const identity = await emitAck(socket, 'identity:initialize', { nickname });
  assert.equal(identity.identity.nickname, nickname);
  return socket;
}

function nextGameState(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:state', onState);
      reject(new Error('Timed out waiting for authoritative game state.'));
    }, 5000);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('game:state', onState);
      resolve(state);
    }
    socket.on('game:state', onState);
  });
}

function nextGameEvent(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:event', onEvent);
      reject(new Error('Timed out waiting for game event.'));
    }, 5000);
    function onEvent(event) {
      if (!predicate(event)) return;
      clearTimeout(timer);
      socket.off('game:event', onEvent);
      resolve(event);
    }
    socket.on('game:event', onEvent);
  });
}

function nextGameShot(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:shot', onShot);
      reject(new Error('Timed out waiting for authoritative shot visual data.'));
    }, 5000);
    function onShot(shot) {
      clearTimeout(timer);
      socket.off('game:shot', onShot);
      resolve(shot);
    }
    socket.on('game:shot', onShot);
  });
}

test('server synchronizes players and validates hit, damage, kill, and respawn state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'retro-fps-combat-'));
  const { app, close, resolveSession } = createApp({
    databasePath: path.join(directory, 'players.sqlite'),
  });
  const server = createServer(app);
  const io = new Server(server);
  const roomManager = attachRoomHandlers(io, { resolveSession });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const clients = [];

  try {
    const inter = await connectGuest(url, 'RedPlayer');
    const gremio = await connectGuest(url, 'BluePlayer');
    clients.push(inter, gremio);
    const invalidRoom = await emitAck(inter, 'room:create', {
      name: 'Invalid target',
      killTarget: 25,
    });
    assert.match(invalidRoom.error, /20, 30 ou 50/);
    const room = await emitAck(inter, 'room:create', {
      name: 'Combat test',
      killTarget: 20,
    });
    assert.equal(room.state.room.killTarget, 20);
    const joined = await emitAck(gremio, 'room:join', { roomId: room.state.room.id });
    assert.equal(joined.state.teams.gremio.length, 1);

    const interGame = await emitAck(inter, 'game:enter');
    const gremioGame = await emitAck(gremio, 'game:enter');
    assert.equal(interGame.state.players.length, 1);
    assert.equal(gremioGame.state.players.length, 2);
    assert.equal(
      gremioGame.state.players.find((entry) => entry.id === gremioGame.playerId).skinId,
      'neon-courier',
    );
    const activeSkinChange = await emitAck(inter, 'player:choose-skin', {
      skinId: 'orbit-salvager',
    });
    assert.match(activeSkinChange.error, /Saia da arena antes/);

    const shooterSpawn = interGame.state.players.find((entry) => entry.id === interGame.playerId);
    const targetSpawn = gremioGame.state.players.find((entry) => entry.id === gremioGame.playerId);
    const targetHeadY = targetSpawn.position.y
      + PLAYER_MODEL.headCenterY
      - PLAYER_MODEL.eyeHeight;
    const aimPitch = Math.atan2(
      targetHeadY - shooterSpawn.position.y,
      shooterSpawn.position.z - targetSpawn.position.z,
    );

    inter.emit('game:input', { keys: [], yaw: 0, pitch: aimPitch });
    gremio.emit('game:input', { keys: [], yaw: Math.PI, pitch: 0 });
    const initialPosition = shooterSpawn.position;
    const movedState = nextGameState(inter, (state) => (
      state.players.find((entry) => entry.id === interGame.playerId)?.position.z
        < initialPosition.z - 0.1
    ));
    const remoteMovedState = nextGameState(gremio, (state) => (
      state.players.find((entry) => entry.id === interGame.playerId)?.position.z
        < initialPosition.z - 0.1
    ));
    inter.emit('game:input', { keys: ['KeyW'], yaw: 0, pitch: aimPitch });
    const stateAfterMovement = await movedState;
    const remoteStateAfterMovement = await remoteMovedState;
    const latestMovement = stateAfterMovement.players.find(
      (entry) => entry.id === interGame.playerId,
    );
    const remoteMovement = remoteStateAfterMovement.players.find(
      (entry) => entry.id === interGame.playerId,
    );
    assert.ok(latestMovement.position.z < initialPosition.z);
    assert.ok(remoteMovement.position.z < initialPosition.z);
    inter.emit('game:input', { keys: [], yaw: 0, pitch: aimPitch });

    let combatStatePromise = nextGameState(inter, (state) => (
      state.players.find((entry) => entry.id === gremioGame.playerId)?.health === 40
    ));
    const firstShotVisual = nextGameShot(inter);
    const firstShot = await emitAck(inter, 'game:shoot');
    const shotVisual = await firstShotVisual;
    assert.equal(firstShot.hitId, gremioGame.playerId);
    assert.equal(firstShot.headshot, true);
    assert.equal(firstShot.targetHealth, 40);
    assert.ok(shotVisual.visualStart);
    assert.ok(
      Math.hypot(
        shotVisual.visualStart.x - shotVisual.start.x,
        shotVisual.visualStart.y - shotVisual.start.y,
        shotVisual.visualStart.z - shotVisual.start.z,
      ) > 1,
      'online tracer should begin at the muzzle, not at the camera origin',
    );
    const impactDirection = {
      x: 0,
      y: Math.sin(aimPitch),
      z: -Math.cos(aimPitch),
    };
    const impactDelta = {
      x: shotVisual.end.x - shotVisual.start.x,
      y: shotVisual.end.y - shotVisual.start.y,
      z: shotVisual.end.z - shotVisual.start.z,
    };
    const crossProductLength = Math.hypot(
      impactDelta.y * impactDirection.z - impactDelta.z * impactDirection.y,
      impactDelta.z * impactDirection.x - impactDelta.x * impactDirection.z,
      impactDelta.x * impactDirection.y - impactDelta.y * impactDirection.x,
    );
    assert.ok(
      crossProductLength < 0.001,
      'the authoritative impact stays on the pitch/yaw aim ray',
    );
    await combatStatePromise;

    await new Promise((resolve) => setTimeout(resolve, 130));
    combatStatePromise = nextGameState(inter, (state) => (
      state.players.find((entry) => entry.id === gremioGame.playerId)?.alive === false
    ));
    const secondShot = await emitAck(inter, 'game:shoot');
    assert.equal(secondShot.kill.victimId, gremioGame.playerId);
    assert.equal(secondShot.kill.killerId, interGame.playerId);
    const deadState = await combatStatePromise;
    assert.equal(deadState.players.find((entry) => entry.id === interGame.playerId).kills, 1);
    assert.equal(deadState.players.find((entry) => entry.id === gremioGame.playerId).deaths, 1);
    assert.equal(deadState.match.teamKills.inter, 1);
    assert.equal(deadState.match.status, 'running');

    const respawnState = await nextGameState(inter, (state) => (
      state.players.find((entry) => entry.id === gremioGame.playerId)?.alive === true
    ));
    assert.equal(respawnState.players.find((entry) => entry.id === gremioGame.playerId).health, 100);
    roomManager.rooms.get(room.state.room.id).match.teamKills.inter = 19;
    await emitAck(inter, 'game:shoot');
    await new Promise((resolve) => setTimeout(resolve, 130));
    const completedStatePromise = nextGameState(inter, (state) => state.match.status === 'finished');
    const matchEndPromise = nextGameEvent(inter, (event) => event.type === 'match-ended');
    const finalShot = await emitAck(inter, 'game:shoot');
    assert.equal(finalShot.kill.victimId, gremioGame.playerId);
    const matchEnd = await matchEndPromise;
    const completedState = await completedStatePromise;
    assert.equal(matchEnd.winner, 'inter');
    assert.equal(matchEnd.killTarget, 20);
    assert.equal(matchEnd.teamKills.inter, 20);
    assert.equal(completedState.match.winner, 'inter');
    assert.equal(completedState.match.status, 'finished');
    assert.match((await emitAck(inter, 'game:shoot')).error, /partida já terminou/);
    assert.equal(stateAfterMovement.players.length, 2);
  } finally {
    clients.forEach((client) => client.disconnect());
    await new Promise((resolve) => io.close(resolve));
    close();
    await rm(directory, { recursive: true, force: true });
  }
});
