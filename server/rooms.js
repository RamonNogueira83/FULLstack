import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import * as THREE from 'three';
import {
  DEFAULT_SKIN_ID,
  isPlayerSkinId,
  PLAYER_MODEL,
} from '../src/game/playerAppearance.js';
import { getMuzzleOffset } from '../src/game/weapon.js';
import {
  containerLayout,
  coverLayout,
  crateLayout,
  pillarLayout,
  wallLayout,
} from '../src/game/mapLayout.js';
import { getMovementInput, rotateMovement } from '../src/game/movement.js';

const TEAM_CAPACITY = 3;
const ROOM_CAPACITY = TEAM_CAPACITY * 2;
const ROOM_NAME_MAX_LENGTH = 24;
const ROOM_PASSWORD_MAX_LENGTH = 32;
const ROOM_PASSWORD_MIN_LENGTH = 4;
const TEAMS = ['inter', 'gremio'];
const GAME_TICK_MS = 50;
const SHOT_INTERVAL_MS = 120;
const RELOAD_DURATION_MS = 1250;
const SHOT_DAMAGE = 34;
const HEADSHOT_DAMAGE = 60;
const SHOT_RANGE = 80;
const MAX_PITCH = Math.PI / 2.5;
const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 2500;
const KILL_TARGETS = [20, 30, 50];

function hashRoomPassword(password, salt = randomBytes(16)) {
  return {
    salt: salt.toString('hex'),
    hash: scryptSync(password, salt, 32).toString('hex'),
  };
}

function matchesRoomPassword(password, stored) {
  const actual = scryptSync(password, Buffer.from(stored.salt, 'hex'), 32);
  return timingSafeEqual(actual, Buffer.from(stored.hash, 'hex'));
}

function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hasPassword: Boolean(room.password),
    playerCount: room.players.size,
    capacity: ROOM_CAPACITY,
    killTarget: room.match.killTarget,
    teamKills: { ...room.match.teamKills },
    matchStatus: room.match.status,
  };
}

function roomState(room) {
  const players = [...room.players.values()].map((player) => ({
    id: player.id,
    nickname: player.nickname,
    team: player.team,
    skinId: player.skinId,
    isHost: player.id === room.hostId,
  }));
  return {
    room: publicRoom(room),
    match: { ...room.match, teamKills: { ...room.match.teamKills } },
    players,
    teams: {
      inter: players.filter((player) => player.team === 'inter'),
      gremio: players.filter((player) => player.team === 'gremio'),
    },
  };
}

function chooseAvailableTeam(room) {
  const counts = Object.fromEntries(TEAMS.map((team) => [
    team,
    [...room.players.values()].filter((player) => player.team === team).length,
  ]));
  if (counts.inter >= TEAM_CAPACITY && counts.gremio >= TEAM_CAPACITY) {
    return null;
  }
  if (counts.inter >= TEAM_CAPACITY) return 'gremio';
  if (counts.gremio >= TEAM_CAPACITY) return 'inter';
  return counts.inter <= counts.gremio ? 'inter' : 'gremio';
}

function validNickname(nickname) {
  return typeof nickname === 'string'
    && nickname.trim().length >= 1
    && nickname.trim().length <= 20
    && /^[\p{L}\p{N}_ -]+$/u.test(nickname.trim());
}

function sendRoomList(io, rooms) {
  io.emit('rooms:list', [...rooms.values()].map(publicRoom));
}

function sendRoomState(io, room) {
  io.to(room.id).emit('room:state', roomState(room));
}

function createWorldRaycast() {
  const scene = new THREE.Scene();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxMaterial = new THREE.MeshBasicMaterial();

  function addBox(x, y, z, width, height, depth, yaw = 0) {
    const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    mesh.rotation.y = yaw;
    scene.add(mesh);
  }

  for (let index = 0; index < 4; index += 1) {
    const offset = -20 + index * 10;
    addBox(offset + 5, 2.5, -19.5, 10, 5, 1);
    addBox(offset + 5, 2.5, 19.5, 10, 5, 1);
    addBox(-19.5, 2.5, offset + 5, 1, 5, 10);
    addBox(19.5, 2.5, offset + 5, 1, 5, 10);
  }
  wallLayout.forEach(([x, y, z, width, height, depth, yaw]) => {
    addBox(x, y, z, width, height, depth, yaw);
  });
  containerLayout.forEach(([x, y, z, width, height, depth, yaw]) => {
    addBox(x, y, z, width, height, depth, yaw);
  });
  coverLayout.forEach(([x, y, z, width, height, depth, yaw]) => {
    addBox(x, y, z, width, height, depth, yaw);
  });
  crateLayout.forEach(([x, y, z, width, height, depth], index) => {
    addBox(x, y, z, width, height, depth, index % 2 === 0 ? Math.PI / 4 : 0);
  });
  pillarLayout.forEach(([x, y, z]) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.05, 5.2, 5),
      boxMaterial,
    );
    pillar.position.set(x, y, z);
    scene.add(pillar);
  });
  scene.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const sphereOffset = new THREE.Vector3();

  function raySphereDistance(rayOrigin, rayDirection, center, radius) {
    sphereOffset.copy(center).sub(rayOrigin);
    const projection = sphereOffset.dot(rayDirection);
    if (projection < 0) return null;
    const perpendicularSquared = sphereOffset.lengthSq() - projection * projection;
    const radiusSquared = radius * radius;
    if (perpendicularSquared > radiusSquared) return null;
    return projection - Math.sqrt(radiusSquared - perpendicularSquared);
  }

  return {
    trace(shooter, players) {
      origin.set(shooter.game.position.x, shooter.game.position.y, shooter.game.position.z);
      direction.set(
        -Math.sin(shooter.game.yaw) * Math.cos(shooter.game.pitch),
        Math.sin(shooter.game.pitch),
        -Math.cos(shooter.game.yaw) * Math.cos(shooter.game.pitch),
      ).normalize();
      const findNearestHit = (rayOrigin, rayDirection) => {
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = SHOT_RANGE;
        const worldHit = raycaster.intersectObjects(scene.children, false)[0];
        let nearestDistance = worldHit?.distance ?? SHOT_RANGE;
        let target = null;
        let headshot = false;

        for (const candidate of players) {
          if (
            candidate === shooter
            || !candidate.game?.alive
            || !candidate.game.active
            || candidate.team === shooter.team
          ) continue;

          const position = candidate.game.position;
          const headDistance = raySphereDistance(
            rayOrigin,
            rayDirection,
            new THREE.Vector3(
              position.x,
              position.y + PLAYER_MODEL.headCenterY - PLAYER_MODEL.eyeHeight,
              position.z,
            ),
            PLAYER_MODEL.headRadius,
          );
          const bodyDistance = raySphereDistance(
            rayOrigin,
            rayDirection,
            new THREE.Vector3(
              position.x,
              position.y + PLAYER_MODEL.bodyCenterY - PLAYER_MODEL.eyeHeight,
              position.z,
            ),
            PLAYER_MODEL.bodyRadius,
          );
          const candidateDistance = headDistance !== null
            && (bodyDistance === null || headDistance < bodyDistance)
            ? headDistance
            : bodyDistance;
          if (candidateDistance !== null && candidateDistance < nearestDistance) {
            nearestDistance = candidateDistance;
            target = candidate;
            headshot = candidateDistance === headDistance;
          }
        }

        return { nearestDistance, target, headshot, worldHit };
      };

      const aimHit = findNearestHit(origin, direction);
      const aimPoint = origin.clone().addScaledVector(
        direction,
        aimHit.nearestDistance,
      );

      const visualStart = origin.clone().add(getMuzzleOffset(
        shooter.game.yaw,
        shooter.game.pitch,
      ));

      return {
        start: { x: origin.x, y: origin.y, z: origin.z },
        visualStart: {
          x: visualStart.x,
          y: visualStart.y,
          z: visualStart.z,
        },
        end: {
          x: aimPoint.x,
          y: aimPoint.y,
          z: aimPoint.z,
        },
        target: aimHit.target,
        headshot: aimHit.headshot,
        hitWorld: !aimHit.target && Boolean(aimHit.worldHit),
      };
    },
  };
}

function gameSnapshot(room) {
  const players = [...room.players.values()]
    .filter((player) => player.game?.active)
    .map((player) => ({
      id: player.id,
      nickname: player.nickname,
      team: player.team,
      skinId: player.skinId,
      position: player.game.position,
      yaw: player.game.yaw,
      pitch: player.game.pitch,
      health: player.game.health,
      alive: player.game.alive,
      kills: player.game.kills,
      deaths: player.game.deaths,
      magazine: player.game.magazine,
      reserve: player.game.reserve,
      reloadingUntil: player.game.reloadingUntil,
    }));
  return {
    roomId: room.id,
    players,
    match: { ...room.match, teamKills: { ...room.match.teamKills } },
  };
}

export function attachRoomHandlers(io, { resolveSession }) {
  const rooms = new Map();
  const members = new Map();
  const worldRaycast = createWorldRaycast();
  let physicsFactoryPromise;
  let previousTick = Date.now();

  function getPhysicsFactory() {
    if (!physicsFactoryPromise) {
      physicsFactoryPromise = import('../src/physics/arenaPhysics.js')
        .then(({ createArenaPhysics }) => createArenaPhysics);
    }
    return physicsFactoryPromise;
  }

  function getSpawnPosition(player, room) {
    const teamPlayers = [...room.players.values()]
      .filter((member) => member.team === player.team);
    const teamIndex = teamPlayers.indexOf(player);
    const offset = (teamIndex - 1) * 1.9;
    return player.team === 'inter'
      ? { x: offset, y: 1.65, z: 15 }
      : { x: offset, y: 1.65, z: -15 };
  }

  async function createPlayerPhysics(player, room) {
    const createArenaPhysics = await getPhysicsFactory();
    const spawn = getSpawnPosition(player, room);
    return {
      physics: await createArenaPhysics({
        crateLayout,
        pillarLayout,
        containerLayout,
        coverLayout,
        wallLayout,
        spawn,
      }),
      position: spawn,
    };
  }

  async function enterGame(socket, acknowledge) {
    const room = rooms.get(members.get(socket.id));
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      acknowledge({ error: 'Entre em uma sala antes de iniciar.' });
      return;
    }
    if (room.match.status === 'finished') {
      acknowledge({ error: 'A partida terminou. Saia da sala para criar outra.' });
      return;
    }
    if (player.game?.active) {
      acknowledge({ state: gameSnapshot(room) });
      return;
    }

    try {
      const { physics, position } = await createPlayerPhysics(player, room);
      player.game = {
        active: true,
        physics,
        position,
        input: new Set(),
        yaw: player.team === 'inter' ? 0 : Math.PI,
        pitch: 0,
        verticalVelocity: 0,
        grounded: true,
        health: MAX_HEALTH,
        alive: true,
        kills: 0,
        deaths: 0,
        magazine: 30,
        reserve: 90,
        lastShotAt: 0,
        reloadingUntil: 0,
        respawnAt: 0,
      };
      room.match.status = 'running';
      sendRoomState(io, room);
      sendRoomList(io, rooms);
      acknowledge({ state: gameSnapshot(room), playerId: player.id });
      io.to(room.id).emit('game:event', {
        type: 'player-entered',
        playerId: player.id,
        nickname: player.nickname,
      });
    } catch (error) {
      console.error('Falha ao iniciar a física multiplayer:', error);
      acknowledge({ error: 'Não foi possível iniciar a arena multiplayer.' });
    }
  }

  function leaveGame(socket) {
    const room = rooms.get(members.get(socket.id));
    const player = room?.players.get(socket.id);
    if (player?.game) {
      player.game.physics?.dispose();
      delete player.game;
      if (room) {
        io.to(room.id).emit('game:event', {
          type: 'player-left',
          playerId: player.id,
          nickname: player.nickname,
        });
        io.to(room.id).emit('game:state', gameSnapshot(room));
      }
    }
  }

  function updateGame() {
    const now = Date.now();
    const delta = Math.min((now - previousTick) / 1000, 0.1);
    previousTick = now;

    for (const room of rooms.values()) {
      let hasActivePlayers = false;
      for (const player of room.players.values()) {
        const game = player.game;
        if (!game?.active) continue;
        hasActivePlayers = true;
        if (room.match.status === 'finished') {
          game.input.clear();
          continue;
        }

        if (!game.alive) {
          if (game.respawnAt <= now) {
            const spawn = getSpawnPosition(player, room);
            game.physics.setPosition(spawn);
            game.position = spawn;
            game.health = MAX_HEALTH;
            game.alive = true;
            game.verticalVelocity = 0;
            io.to(room.id).emit('game:event', {
              type: 'respawn',
              playerId: player.id,
              nickname: player.nickname,
            });
          }
          continue;
        }

        if (game.reloadingUntil && game.reloadingUntil <= now) {
          const amount = Math.min(30 - game.magazine, game.reserve);
          game.magazine += amount;
          game.reserve -= amount;
          game.reloadingUntil = 0;
        }

        const input = getMovementInput(game.input);
        const speed = game.input.has('ShiftLeft') || game.input.has('ShiftRight') ? 9 : 5.5;
        const horizontal = rotateMovement(input, game.yaw, speed * delta);
        if (game.grounded && game.verticalVelocity < 0) game.verticalVelocity = 0;
        if (game.jumpRequested && game.grounded) {
          game.verticalVelocity = 6.2;
          game.grounded = false;
        }
        game.jumpRequested = false;
        game.verticalVelocity -= 16 * delta;
        game.position = game.physics.move({
          x: horizontal.x,
          y: game.verticalVelocity * delta,
          z: horizontal.z,
        });
        game.grounded = game.position.grounded;
        if (game.grounded && game.verticalVelocity < 0) game.verticalVelocity = 0;
      }
      if (hasActivePlayers) io.to(room.id).emit('game:state', gameSnapshot(room));
    }
  }

  const gameTimer = setInterval(updateGame, GAME_TICK_MS);
  gameTimer.unref();

  function leaveCurrentRoom(socket) {
    const roomId = members.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    members.delete(socket.id);
    socket.leave(roomId);
    if (!room) return;

    const leavingPlayer = room.players.get(socket.id);
    leavingPlayer?.game?.physics?.dispose();
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      rooms.delete(roomId);
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players.keys().next().value;
      }
      sendRoomState(io, room);
    }
    sendRoomList(io, rooms);
  }

  io.on('connection', (socket) => {
    socket.on('identity:initialize', async (payload, acknowledge = () => {}) => {
      try {
        const player = await resolveSession(socket.request.headers.cookie);
        const requestedNickname = payload?.nickname;
        if (player) {
          socket.data.identity = {
            id: `player:${player.id}`,
            nickname: player.nickname,
            authenticated: true,
          };
        } else if (validNickname(requestedNickname)) {
          socket.data.identity = {
            id: `guest:${socket.id}`,
            nickname: requestedNickname.trim(),
            authenticated: false,
          };
        } else {
          acknowledge({ error: 'Informe um nick de visitante válido.' });
          return;
        }
        acknowledge({ identity: socket.data.identity });
      } catch (error) {
        console.error('Falha ao identificar jogador no lobby:', error);
        acknowledge({ error: 'Não foi possível validar sua sessão.' });
      }
    });

    socket.on('rooms:list', (_payload, acknowledge = () => {}) => {
      acknowledge({ rooms: [...rooms.values()].map(publicRoom) });
    });

    socket.on('room:create', (payload, acknowledge = () => {}) => {
      const identity = socket.data.identity;
      if (!identity) {
        acknowledge({ error: 'Identifique-se antes de criar uma sala.' });
        return;
      }

      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      const password = typeof payload?.password === 'string' ? payload.password : '';
      const killTarget = Number(payload?.killTarget ?? 20);
      if (name.length < 3 || name.length > ROOM_NAME_MAX_LENGTH) {
        acknowledge({ error: `O nome da sala deve ter de 3 a ${ROOM_NAME_MAX_LENGTH} caracteres.` });
        return;
      }
      if (password.length > 0 && (
        password.length < ROOM_PASSWORD_MIN_LENGTH
        || password.length > ROOM_PASSWORD_MAX_LENGTH
      )) {
        acknowledge({
          error: `A senha da sala deve ter de ${ROOM_PASSWORD_MIN_LENGTH} a ${ROOM_PASSWORD_MAX_LENGTH} caracteres.`,
        });
        return;
      }
      if (rooms.size >= 100) {
        acknowledge({ error: 'O limite de salas disponíveis foi atingido.' });
        return;
      }
      if (!KILL_TARGETS.includes(killTarget)) {
        acknowledge({ error: 'Escolha uma meta de eliminações de 20, 30 ou 50.' });
        return;
      }

      leaveCurrentRoom(socket);
      let id;
      do {
        id = randomBytes(3).toString('hex').toUpperCase();
      } while (rooms.has(id));

      const room = {
        id,
        name,
        password: password ? hashRoomPassword(password) : null,
        players: new Map(),
        hostId: socket.id,
        match: {
          killTarget,
          teamKills: { inter: 0, gremio: 0 },
          status: 'waiting',
          winner: null,
        },
      };
      room.players.set(socket.id, {
        id: identity.id,
        nickname: identity.nickname,
        team: 'inter',
        skinId: DEFAULT_SKIN_ID,
        game: null,
      });
      rooms.set(id, room);
      members.set(socket.id, id);
      socket.join(id);
      acknowledge({ state: roomState(room) });
      sendRoomState(io, room);
      sendRoomList(io, rooms);
    });

    socket.on('room:join', (payload, acknowledge = () => {}) => {
      const identity = socket.data.identity;
      if (!identity) {
        acknowledge({ error: 'Identifique-se antes de entrar em uma sala.' });
        return;
      }

      const room = rooms.get(payload?.roomId);
      if (!room) {
        acknowledge({ error: 'Essa sala não existe mais.' });
        return;
      }
      if (room.password && (
        typeof payload?.password !== 'string'
        || payload.password.length > ROOM_PASSWORD_MAX_LENGTH
        || !matchesRoomPassword(payload.password, room.password)
      )) {
        acknowledge({ error: 'Senha da sala incorreta.' });
        return;
      }
      if (room.players.size >= ROOM_CAPACITY) {
        acknowledge({ error: 'A sala está cheia.' });
        return;
      }

      leaveCurrentRoom(socket);
      const team = chooseAvailableTeam(room);
      if (!team) {
        acknowledge({ error: 'Os dois times estão completos.' });
        return;
      }
      room.players.set(socket.id, {
        id: identity.id,
        nickname: identity.nickname,
        team,
        skinId: DEFAULT_SKIN_ID,
        game: null,
      });
      members.set(socket.id, room.id);
      socket.join(room.id);
      acknowledge({ state: roomState(room) });
      sendRoomState(io, room);
      sendRoomList(io, rooms);
    });

    socket.on('room:choose-team', (payload, acknowledge = () => {}) => {
      const room = rooms.get(members.get(socket.id));
      const player = room?.players.get(socket.id);
      const team = payload?.team;
      if (!room || !player || !TEAMS.includes(team)) {
        acknowledge({ error: 'Não foi possível trocar de time.' });
        return;
      }
      const teamCount = [...room.players.values()]
        .filter((member) => member.team === team).length;
      if (player.team !== team && teamCount >= TEAM_CAPACITY) {
        acknowledge({ error: 'Esse time já tem 3 jogadores.' });
        return;
      }
      if (player.game?.active) {
        acknowledge({ error: 'Saia da arena antes de trocar de time.' });
        return;
      }
      player.team = team;
      acknowledge({ state: roomState(room) });
      sendRoomState(io, room);
    });

    socket.on('player:choose-skin', (payload, acknowledge = () => {}) => {
      const room = rooms.get(members.get(socket.id));
      const player = room?.players.get(socket.id);
      const skinId = payload?.skinId;
      if (!room || !player || !isPlayerSkinId(skinId)) {
        acknowledge({ error: 'Escolha uma skin disponível.' });
        return;
      }
      if (player.game?.active) {
        acknowledge({ error: 'Saia da arena antes de trocar de skin.' });
        return;
      }

      player.skinId = skinId;
      acknowledge({ state: roomState(room) });
      sendRoomState(io, room);
    });

    socket.on('room:leave', (_payload, acknowledge = () => {}) => {
      leaveGame(socket);
      leaveCurrentRoom(socket);
      acknowledge({ ok: true });
    });

    socket.on('game:enter', (_payload, acknowledge = () => {}) => {
      void enterGame(socket, acknowledge);
    });

    socket.on('game:leave', (_payload, acknowledge = () => {}) => {
      leaveGame(socket);
      acknowledge({ ok: true });
    });

    socket.on('game:input', (payload) => {
      const room = rooms.get(members.get(socket.id));
      const player = room?.players.get(socket.id);
      const game = player?.game;
      if (
        !game?.active
        || !game.alive
        || !Array.isArray(payload?.keys)
        || payload.keys.length > 8
      ) return;
      if (room.match.status === 'finished') return;
      const allowedKeys = new Set([
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ShiftLeft',
        'ShiftRight',
      ]);
      game.input = new Set(payload.keys.filter((key) => allowedKeys.has(key)));
      const yaw = payload.yaw;
      const pitch = payload.pitch;
      if (Number.isFinite(yaw)) {
        game.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      }
      if (Number.isFinite(pitch)) {
        game.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
      }
      game.jumpRequested ||= payload.jump === true;
    });

    socket.on('game:shoot', (_payload, acknowledge = () => {}) => {
      const room = rooms.get(members.get(socket.id));
      const shooter = room?.players.get(socket.id);
      const game = shooter?.game;
      const now = Date.now();
      if (!game?.active || !game.alive) {
        acknowledge({ error: 'Você não está ativo na arena.' });
        return;
      }
      if (room.match.status === 'finished') {
        acknowledge({ error: 'A partida já terminou.' });
        return;
      }
      if (game.reloadingUntil > now) {
        acknowledge({ error: 'Recarregando.' });
        return;
      }
      if (now - game.lastShotAt < SHOT_INTERVAL_MS) {
        acknowledge({ error: 'Aguarde o próximo disparo.' });
        return;
      }
      if (game.magazine <= 0) {
        acknowledge({ error: 'Sem munição no carregador.' });
        return;
      }

      game.lastShotAt = now;
      game.magazine -= 1;
      const shot = worldRaycast.trace(shooter, [...room.players.values()]);
      let kill = null;
      if (shot.target) {
        const victimGame = shot.target.game;
        victimGame.health = Math.max(
          0,
          victimGame.health - (shot.headshot ? HEADSHOT_DAMAGE : SHOT_DAMAGE),
        );
        if (victimGame.health === 0) {
          victimGame.alive = false;
          victimGame.deaths += 1;
          victimGame.respawnAt = now + RESPAWN_DELAY_MS;
          game.kills += 1;
          room.match.teamKills[shooter.team] += 1;
          kill = {
            killerId: shooter.id,
            killerNickname: shooter.nickname,
            victimId: shot.target.id,
            victimNickname: shot.target.nickname,
          };
          if (room.match.teamKills[shooter.team] >= room.match.killTarget) {
            room.match.status = 'finished';
            room.match.winner = shooter.team;
            for (const member of room.players.values()) {
              if (member.game) member.game.input.clear();
            }
            io.to(room.id).emit('game:event', {
              type: 'match-ended',
              winner: shooter.team,
              winnerName: shooter.team === 'inter' ? 'Internacional' : 'Grêmio',
              killTarget: room.match.killTarget,
              teamKills: { ...room.match.teamKills },
            });
          }
        }
      }

      io.to(room.id).emit('game:shot', {
        shooterId: shooter.id,
        shooterNickname: shooter.nickname,
        start: shot.start,
        visualStart: shot.visualStart,
        end: shot.end,
        hitId: shot.target?.id ?? null,
        headshot: shot.headshot,
        hitWorld: shot.hitWorld,
      });
      if (kill) {
        io.to(room.id).emit('game:event', { type: 'kill', ...kill });
        sendRoomState(io, room);
        sendRoomList(io, rooms);
      }
      acknowledge({
        magazine: game.magazine,
        reserve: game.reserve,
        hitId: shot.target?.id ?? null,
        headshot: shot.headshot,
        targetHealth: shot.target?.game.health ?? null,
        kill,
      });
      io.to(room.id).emit('game:state', gameSnapshot(room));
    });

    socket.on('game:reload', (_payload, acknowledge = () => {}) => {
      const room = rooms.get(members.get(socket.id));
      const game = room?.players.get(socket.id)?.game;
      const now = Date.now();
      if (!game?.active || !game.alive) {
        acknowledge({ error: 'Você não está ativo na arena.' });
        return;
      }
      if (room.match.status === 'finished') {
        acknowledge({ error: 'A partida já terminou.' });
        return;
      }
      if (
        game.reloadingUntil > now
        || game.magazine >= 30
        || game.reserve <= 0
      ) {
        acknowledge({ error: 'Não é possível recarregar agora.' });
        return;
      }
      game.reloadingUntil = now + RELOAD_DURATION_MS;
      acknowledge({ reloadingUntil: game.reloadingUntil });
      io.to(room.id).emit('game:state', gameSnapshot(room));
    });

    socket.on('disconnect', () => leaveCurrentRoom(socket));
  });

  return {
    get rooms() {
      return rooms;
    },
    close() {
      clearInterval(gameTimer);
      for (const room of rooms.values()) {
        for (const player of room.players.values()) {
          player.game?.physics?.dispose();
        }
      }
    },
  };
}
