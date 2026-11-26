import * as THREE from 'three';
import {
  containerLayout,
  coverLayout,
  crateLayout,
  pillarLayout,
  wallLayout,
} from './game/mapLayout.js';
import { getMovementInput, rotateMovement } from './game/movement.js';
import { clampLookDelta } from './game/lookControls.js';
import { playShotSound } from './game/shotAudio.js';
import {
  getPlayerSkin,
  PLAYER_MODEL,
} from './game/playerAppearance.js';
import {
  completeReload,
  createRifleState,
  fireRound,
  SHOT_INTERVAL,
  startReload,
} from './game/shooting.js';
import { createRifleViewModel } from './game/weapon.js';
import { socket } from './network.js';
import './style.css';

const canvas = document.querySelector('#game-canvas');
const errorMessage = document.querySelector('.error-message');
const enterButton = document.querySelector('#enter-button');
const startPanel = document.querySelector('.start-panel');
const controlStatus = document.querySelector('.control-status');
const ammoCount = document.querySelector('.ammo-count');
const reserveCount = document.querySelector('.reserve-count');
const reloadStatus = document.querySelector('.reload-status');
const lobbyRoot = document.querySelector('#lobby-root');
const returnLobbyButton = document.querySelector('#return-lobby-button');
const combatHud = document.querySelector('.combat-hud');
const healthValue = document.querySelector('#health-value');
const healthFill = document.querySelector('#health-fill');
const killCount = document.querySelector('#kill-count');
const deathCount = document.querySelector('#death-count');
const onlineCount = document.querySelector('#online-count');
const scoreboard = document.querySelector('#scoreboard');
const combatNotice = document.querySelector('#combat-notice');
const killFeed = document.querySelector('#kill-feed');
const interScore = document.querySelector('#inter-score');
const gremioScore = document.querySelector('#gremio-score');
const killTargetDisplay = document.querySelector('#kill-target');
const matchResult = document.querySelector('#match-result');
const matchResultTitle = document.querySelector('#match-result-title');
const matchResultScore = document.querySelector('#match-result-score');
const matchReturnButton = document.querySelector('#match-return-button');

if (
  !(canvas instanceof HTMLCanvasElement)
  || !(errorMessage instanceof HTMLElement)
  || !(enterButton instanceof HTMLButtonElement)
  || !(startPanel instanceof HTMLElement)
  || !(controlStatus instanceof HTMLElement)
  || !(ammoCount instanceof HTMLElement)
  || !(reserveCount instanceof HTMLElement)
  || !(reloadStatus instanceof HTMLElement)
  || !(lobbyRoot instanceof HTMLElement)
  || !(returnLobbyButton instanceof HTMLButtonElement)
  || !(combatHud instanceof HTMLElement)
  || !(healthValue instanceof HTMLElement)
  || !(healthFill instanceof HTMLElement)
  || !(killCount instanceof HTMLElement)
  || !(deathCount instanceof HTMLElement)
  || !(onlineCount instanceof HTMLElement)
  || !(scoreboard instanceof HTMLOListElement)
  || !(combatNotice instanceof HTMLElement)
  || !(killFeed instanceof HTMLElement)
  || !(interScore instanceof HTMLElement)
  || !(gremioScore instanceof HTMLElement)
  || !(killTargetDisplay instanceof HTMLElement)
  || !(matchResult instanceof HTMLElement)
  || !(matchResultTitle instanceof HTMLElement)
  || !(matchResultScore instanceof HTMLElement)
  || !(matchReturnButton instanceof HTMLButtonElement)
) {
  throw new Error('Elementos necessários para iniciar a arena não foram encontrados.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#18201e');
scene.fog = new THREE.Fog('#18201e', 32, 68);

const camera = new THREE.PerspectiveCamera(76, 1, 0.1, 100);
camera.position.set(0, 1.65, 16);
camera.rotation.order = 'YXZ';
scene.add(camera);
const shootableObjects = [];

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
} catch (error) {
  errorMessage.hidden = false;
  errorMessage.textContent = 'Não foi possível iniciar o WebGL neste navegador.';
  throw error;
}

renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

scene.add(new THREE.HemisphereLight('#c0cbc1', '#292820', 1.8));

const sunlight = new THREE.DirectionalLight('#f2d5a0', 2.8);
sunlight.position.set(-8, 18, 7);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1024, 1024);
sunlight.shadow.bias = -0.00025;
sunlight.shadow.normalBias = 0.025;
sunlight.shadow.camera.left = -22;
sunlight.shadow.camera.right = 22;
sunlight.shadow.camera.top = 22;
sunlight.shadow.camera.bottom = -22;
scene.add(sunlight);

function createFloorTexture() {
  const size = 192;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;

  const context = textureCanvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível criar a textura do piso.');
  }

  context.fillStyle = '#555952';
  context.fillRect(0, 0, size, size);
  let seed = 93;
  for (let index = 0; index < 2600; index += 1) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % size;
    seed = (seed * 16807) % 2147483647;
    const y = seed % size;
    const shade = 62 + (seed % 34);
    context.fillStyle = `rgb(${shade} ${shade + 2} ${shade - 4})`;
    context.fillRect(x, y, 1 + (seed % 3), 1);
  }

  const tileSize = 48;
  context.strokeStyle = '#73756a';
  context.lineWidth = 1;
  for (let offset = 0; offset <= size; offset += tileSize) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, offset);
    context.lineTo(size, offset);
    context.stroke();
  }

  context.fillStyle = '#b39656';
  for (let y = 3; y < size; y += 14) {
    context.fillRect(37, y, 2, 7);
    context.fillRect(89, y + 6, 2, 7);
  }

  context.fillStyle = '#8b4937';
  context.fillRect(4, 4, 4, 120);
  context.fillRect(120, 4, 4, 120);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function addBox(width, height, depth, material, position) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  shootableObjects.push(mesh);
  return mesh;
}

function addOrientedBox(width, height, depth, material, position, yaw = 0) {
  const mesh = addBox(width, height, depth, material, position);
  mesh.rotation.y = yaw;
  return mesh;
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({
    map: createFloorTexture(),
    roughness: 1,
    metalness: 0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.06;
floor.receiveShadow = true;
scene.add(floor);
shootableObjects.push(floor);

const wallMaterials = [
  '#414b48',
  '#505853',
  '#38423f',
  '#5b5b4c',
].map((color) => new THREE.MeshStandardMaterial({
  color,
  flatShading: true,
  roughness: 1,
}));

const wallHeight = 5;
const wallWidth = 10;
for (let index = 0; index < 4; index += 1) {
  const offset = -20 + index * wallWidth;
  const material = wallMaterials[index % wallMaterials.length];
  addBox(wallWidth, wallHeight, 1, material, [offset + wallWidth / 2, wallHeight / 2, -19.5]);
  addBox(wallWidth, wallHeight, 1, material, [offset + wallWidth / 2, wallHeight / 2, 19.5]);
  addBox(1, wallHeight, wallWidth, material, [-19.5, wallHeight / 2, offset + wallWidth / 2]);
  addBox(1, wallHeight, wallWidth, material, [19.5, wallHeight / 2, offset + wallWidth / 2]);
}

const partitionMaterial = new THREE.MeshStandardMaterial({
  color: '#414946',
  flatShading: true,
  roughness: 1,
});
wallLayout.forEach(([x, y, z, width, height, depth, yaw]) => {
  addOrientedBox(width, height, depth, partitionMaterial, [x, y, z], yaw);
});

const trimMaterial = new THREE.MeshStandardMaterial({
  color: '#c19a50',
  flatShading: true,
  roughness: 0.9,
});
addBox(39, 0.22, 0.2, trimMaterial, [0, 2.9, -18.85]);
addBox(39, 0.22, 0.2, trimMaterial, [0, 2.9, 18.85]);
addBox(0.2, 0.22, 39, trimMaterial, [-18.85, 2.9, 0]);
addBox(0.2, 0.22, 39, trimMaterial, [18.85, 2.9, 0]);

const beamMaterial = new THREE.MeshStandardMaterial({
  color: '#29312f',
  metalness: 0.45,
  roughness: 0.78,
  flatShading: true,
});
for (const z of [-14, -7, 0, 7, 14]) {
  addBox(39, 0.22, 0.42, beamMaterial, [0, 4.65, z]);
}
for (const x of [-18, 18]) {
  addBox(0.32, 0.28, 38, beamMaterial, [x, 4.72, 0]);
}

const crateMaterial = new THREE.MeshStandardMaterial({
  color: '#986744',
  flatShading: true,
  roughness: 1,
});
const crateGeometry = new THREE.BoxGeometry(1, 1, 1);
const crates = new THREE.InstancedMesh(crateGeometry, crateMaterial, crateLayout.length);
const crateTransform = new THREE.Object3D();
crateLayout.forEach(([x, y, z, width, height, depth], index) => {
  crateTransform.position.set(x, y, z);
  crateTransform.scale.set(width, height, depth);
  crateTransform.rotation.y = index % 2 === 0 ? Math.PI / 4 : 0;
  crateTransform.updateMatrix();
  crates.setMatrixAt(index, crateTransform.matrix);
});
crates.castShadow = true;
crates.receiveShadow = true;
scene.add(crates);
shootableObjects.push(crates);

const coverMaterial = new THREE.MeshStandardMaterial({
  color: '#68706a',
  flatShading: true,
  roughness: 1,
});
const coverGeometry = new THREE.BoxGeometry(1, 1, 1);
const covers = new THREE.InstancedMesh(coverGeometry, coverMaterial, coverLayout.length);
const coverTransform = new THREE.Object3D();
coverLayout.forEach(([x, y, z, width, height, depth, yaw], index) => {
  coverTransform.position.set(x, y, z);
  coverTransform.scale.set(width, height, depth);
  coverTransform.rotation.y = yaw;
  coverTransform.updateMatrix();
  covers.setMatrixAt(index, coverTransform.matrix);
  covers.setColorAt(index, new THREE.Color(index % 2 === 0 ? '#68706a' : '#776c58'));
});
covers.castShadow = true;
covers.receiveShadow = true;
scene.add(covers);
shootableObjects.push(covers);

const containerMaterials = [
  new THREE.MeshStandardMaterial({
    color: '#794936',
    metalness: 0.34,
    roughness: 0.82,
    flatShading: true,
  }),
  new THREE.MeshStandardMaterial({
    color: '#43564d',
    metalness: 0.38,
    roughness: 0.8,
    flatShading: true,
  }),
];
const containerGeometry = new THREE.BoxGeometry(1, 1, 1);
containerMaterials.forEach((material, materialIndex) => {
  const entries = containerLayout.filter((container) => container[7] === materialIndex);
  const containers = new THREE.InstancedMesh(containerGeometry, material, entries.length);
  const containerTransform = new THREE.Object3D();

  entries.forEach(([x, y, z, width, height, depth, yaw], index) => {
    containerTransform.position.set(x, y, z);
    containerTransform.scale.set(width, height, depth);
    containerTransform.rotation.y = yaw;
    containerTransform.updateMatrix();
    containers.setMatrixAt(index, containerTransform.matrix);
  });

  containers.castShadow = true;
  containers.receiveShadow = true;
  scene.add(containers);
  shootableObjects.push(containers);
});

const ribMaterial = new THREE.MeshStandardMaterial({
  color: '#a58a69',
  metalness: 0.42,
  roughness: 0.7,
  flatShading: true,
});
const ribEntries = [];
for (const [x, y, z, width, height, depth, yaw] of containerLayout) {
  for (const face of [-1, 1]) {
    for (let localX = -width / 2 + 0.38; localX < width / 2; localX += 0.62) {
      const localZ = face * (depth / 2 + 0.035);
      ribEntries.push({
        x: x + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
        y,
        z: z - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
        height: height - 0.18,
        yaw,
      });
    }
  }
}
const containerRibs = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.075, 1, 0.09),
  ribMaterial,
  ribEntries.length,
);
const ribTransform = new THREE.Object3D();
ribEntries.forEach(({ x, y, z, height, yaw }, index) => {
  ribTransform.position.set(x, y, z);
  ribTransform.scale.set(1, height, 1);
  ribTransform.rotation.y = yaw;
  ribTransform.updateMatrix();
  containerRibs.setMatrixAt(index, ribTransform.matrix);
});
containerRibs.castShadow = true;
scene.add(containerRibs);
shootableObjects.push(containerRibs);

const pillarMaterial = new THREE.MeshStandardMaterial({
  color: '#747768',
  flatShading: true,
  roughness: 0.95,
});
const pillarGeometry = new THREE.CylinderGeometry(0.8, 1.05, 5.2, 5, 1);
const pillars = new THREE.InstancedMesh(pillarGeometry, pillarMaterial, pillarLayout.length);
const pillarTransform = new THREE.Object3D();
pillarLayout.forEach(([x, y, z], index) => {
  pillarTransform.position.set(x, y, z);
  pillarTransform.rotation.y = index % 2 === 0 ? 0 : Math.PI / 5;
  pillarTransform.updateMatrix();
  pillars.setMatrixAt(index, pillarTransform.matrix);
});
pillars.castShadow = true;
pillars.receiveShadow = true;
scene.add(pillars);
shootableObjects.push(pillars);

const centerPlatform = addBox(
  3.2,
  0.5,
  3.2,
  new THREE.MeshStandardMaterial({
    color: '#68715a',
    flatShading: true,
    roughness: 1,
  }),
  [0, 0.25, 0],
);
centerPlatform.rotation.y = Math.PI / 4;

const platformBand = addBox(
  3.5,
  0.11,
  0.14,
  trimMaterial,
  [0, 0.53, 0],
);
platformBand.rotation.y = Math.PI / 4;

const floorMarkingMaterial = new THREE.MeshStandardMaterial({
  color: '#bd9e58',
  roughness: 0.96,
  metalness: 0,
});
for (const x of [-10.8, 10.8]) {
  for (const z of [-14, -10.5, 10.5, 14]) {
    addBox(0.12, 0.018, 2.1, floorMarkingMaterial, [x, -0.035, z]);
  }
}

const warningMaterial = new THREE.MeshStandardMaterial({
  color: '#d1a342',
  roughness: 0.76,
  emissive: '#4b3213',
  emissiveIntensity: 0.15,
});
const warningStripes = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.12, 0.025, 0.5),
  warningMaterial,
  20,
);
const stripeTransform = new THREE.Object3D();
for (let index = 0; index < 20; index += 1) {
  stripeTransform.position.set(-4.2 + index * 0.44, -0.025, index % 2 === 0 ? -12 : 12);
  stripeTransform.rotation.y = index % 2 === 0 ? -0.45 : 0.45;
  stripeTransform.updateMatrix();
  warningStripes.setMatrixAt(index, stripeTransform.matrix);
}
scene.add(warningStripes);

function createSectorSign(label, subtitle) {
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 128;
  signCanvas.height = 64;
  const context = signCanvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível gerar a sinalização da arena.');
  }

  context.fillStyle = '#222a27';
  context.fillRect(0, 0, 128, 64);
  context.fillStyle = '#b28b4d';
  context.fillRect(0, 0, 128, 5);
  context.fillRect(0, 59, 128, 5);
  context.fillStyle = '#e4dfcb';
  context.font = 'bold 19px monospace';
  context.fillText(label, 10, 31);
  context.fillStyle = '#c4b887';
  context.font = '10px monospace';
  context.fillText(subtitle, 10, 48);

  const texture = new THREE.CanvasTexture(signCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.6),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  return sign;
}

const westSign = createSectorSign('SECTOR 03', 'WEST SERVICE LANE');
westSign.position.set(-7, 3.35, -18.94);
scene.add(westSign);
const eastSign = createSectorSign('DOCK 07', 'EAST TRANSFER BAY');
eastSign.position.set(7, 3.35, -18.94);
scene.add(eastSign);

const accentMaterial = new THREE.MeshStandardMaterial({
  color: '#d3a449',
  emissive: '#6e4118',
  emissiveIntensity: 0.9,
  roughness: 0.8,
});
for (const x of [-18.7, 18.7]) {
  for (const z of [-18.7, 18.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), accentMaterial);
    lamp.position.set(x, 4.35, z);
    scene.add(lamp);
  }
}

for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
  const fillLight = new THREE.PointLight('#d1bd8c', 11, 13, 2);
  fillLight.position.set(x, 4.1, z);
  scene.add(fillLight);
}

const weapon = createRifleViewModel(camera);
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const shotDirection = new THREE.Vector3();
const shotEnd = new THREE.Vector3();
const muzzlePosition = new THREE.Vector3();
const impactNormal = new THREE.Vector3();
const impactEffects = [];
const tracerEffects = [];
const rifleState = createRifleState();
let fireHeld = false;
let nextMuzzleFlashEnd = 0;
const shotRange = 80;
const impactLifetime = 1.1;

const clock = new THREE.Clock();
const pressedKeys = new Set();
const LOCAL_POSITION_RECONCILIATION_DISTANCE_SQUARED = 16;
const player = {
  yaw: 0,
  pitch: 0,
  verticalVelocity: 0,
  grounded: true,
};
let fallbackControls = false;
let previousPointerPosition = null;
let ignoreNextMouseMove = false;
const mouseSensitivity = 0.002;
let physics;
let physicsPromise;
let physicsLoading = false;
let recoil = 0;
let arenaSelected = false;
let onlineGame = false;
let localPlayerId = null;
let currentRoomId = null;
let onlinePlayers = new Map();
let lastInputSentAt = 0;
let localAlive = true;
let hasInitializedLocalView = false;
let jumpPending = false;
let matchFinished = false;

function updateAmmoHud() {
  ammoCount.textContent = String(rifleState.magazine).padStart(2, '0');
  ammoCount.classList.toggle('is-low', rifleState.magazine <= 6);
  reserveCount.textContent = String(rifleState.reserve).padStart(2, '0');
}

function updateCombatHud(snapshot) {
  const { players } = snapshot;
  const local = players.find((entry) => entry.id === localPlayerId);
  if (!local) return;
  rifleState.magazine = local.magazine;
  rifleState.reserve = local.reserve;
  localAlive = local.alive;
  healthValue.textContent = String(local.health);
  healthFill.style.width = `${local.health}%`;
  healthFill.classList.toggle('is-critical', local.health <= 30);
  killCount.textContent = String(local.kills);
  deathCount.textContent = String(local.deaths);
  onlineCount.textContent = String(players.length);
  interScore.textContent = String(snapshot.match.teamKills.inter);
  gremioScore.textContent = String(snapshot.match.teamKills.gremio);
  killTargetDisplay.textContent = String(snapshot.match.killTarget);
  matchFinished = snapshot.match.status === 'finished';
  combatHud.hidden = false;
  updateAmmoHud();
  combatNotice.hidden = local.alive;
  combatNotice.textContent = local.alive ? '' : 'ELIMINADO · AGUARDE O RESPAWN';

  const ranked = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  scoreboard.replaceChildren(...ranked.map((entry, index) => {
    const item = document.createElement('li');
    item.classList.toggle('is-self', entry.id === localPlayerId);
    const position = document.createElement('span');
    position.textContent = `${index + 1}. ${entry.nickname}`;
    const score = document.createElement('b');
    score.textContent = `${entry.kills} / ${entry.deaths}`;
    item.append(position, score);
    return item;
  }));
}

function createRemotePlayer(player) {
  const group = new THREE.Group();
  const skin = getPlayerSkin(player.skinId);
  const teamColor = player.team === 'inter' ? '#c34b37' : '#477db5';
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: skin.body,
    roughness: 0.9,
    flatShading: true,
  });
  const armorMaterial = new THREE.MeshStandardMaterial({
    color: skin.armor,
    roughness: 0.82,
    flatShading: true,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: skin.accent,
    roughness: 0.75,
    flatShading: true,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: '#242923',
    roughness: 1,
    flatShading: true,
  });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: skin.visor,
    metalness: 0.35,
    roughness: 0.28,
    flatShading: true,
  });
  const teamMaterial = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.72,
    flatShading: true,
  });
  const addPart = (geometry, material, position, rotation = [0, 0, 0]) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position);
    part.rotation.set(...rotation);
    part.castShadow = true;
    group.add(part);
    return part;
  };

  addPart(
    new THREE.BoxGeometry(0.52, 0.92, 0.36),
    bodyMaterial,
    [0, PLAYER_MODEL.bodyCenterY, 0],
  );
  addPart(new THREE.BoxGeometry(0.4, 0.36, 0.075), armorMaterial, [0, 1.08, -0.2]);
  addPart(new THREE.BoxGeometry(0.44, 0.075, 0.055), teamMaterial, [0, 1.38, -0.215]);
  addPart(new THREE.BoxGeometry(0.2, 0.12, 0.06), accentMaterial, [0, 1.07, -0.246]);
  for (const side of [-1, 1]) {
    addPart(
      new THREE.BoxGeometry(0.2, 0.66, 0.28),
      bodyMaterial,
      [side * 0.36, 0.98, 0],
      [0, 0, side * -0.08],
    );
    addPart(new THREE.BoxGeometry(0.23, 0.18, 0.31), armorMaterial, [side * 0.36, 1.31, 0]);
    addPart(new THREE.BoxGeometry(0.18, 0.45, 0.26), darkMaterial, [side * 0.14, 0.3, 0]);
    addPart(new THREE.BoxGeometry(0.22, 0.16, 0.34), darkMaterial, [side * 0.14, 0.08, -0.035]);
  }

  const helmetGeometry = skin.headStyle === 'pilot'
    ? new THREE.SphereGeometry(0.275, 8, 6)
    : skin.headStyle === 'hood'
      ? new THREE.IcosahedronGeometry(0.29, 1)
      : new THREE.DodecahedronGeometry(0.265, 0);
  addPart(helmetGeometry, new THREE.MeshStandardMaterial({
    color: skin.helmet,
    roughness: 0.78,
    flatShading: true,
  }), [0, PLAYER_MODEL.headCenterY, 0]);
  addPart(
    new THREE.BoxGeometry(
      skin.headStyle === 'hood' ? 0.34 : 0.3,
      skin.headStyle === 'pilot' ? 0.11 : 0.14,
      0.075,
    ),
    visorMaterial,
    [0, 1.64, -0.22],
  );
  if (skin.headStyle === 'pilot') {
    addPart(new THREE.BoxGeometry(0.36, 0.055, 0.08), accentMaterial, [0, 1.78, -0.04]);
  } else if (skin.headStyle === 'hood') {
    addPart(new THREE.BoxGeometry(0.36, 0.14, 0.13), accentMaterial, [0, 1.39, -0.19]);
  } else {
    addPart(new THREE.BoxGeometry(0.1, 0.055, 0.035), accentMaterial, [0, 1.82, -0.19]);
  }

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 48;
  const context = labelCanvas.getContext('2d');
  if (context) {
    context.fillStyle = '#11130f';
    context.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
    context.strokeStyle = teamColor;
    context.lineWidth = 3;
    context.strokeRect(1, 1, labelCanvas.width - 2, labelCanvas.height - 2);
    context.fillStyle = '#eee9d9';
    context.font = 'bold 22px monospace';
    context.textAlign = 'center';
    context.fillText(player.nickname.slice(0, 18), 128, 31);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.magFilter = THREE.NearestFilter;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
    }));
    label.position.y = 2.15;
    label.scale.set(1.7, 0.32, 1);
    group.add(label);
    group.userData.labelTexture = labelTexture;
  }

  group.userData.targetPosition = new THREE.Vector3();
  group.userData.team = player.team;
  group.userData.skinId = skin.id;
  scene.add(group);
  return group;
}

function applyGameState(state) {
  if (state.roomId && currentRoomId && state.roomId !== currentRoomId) return;
  const activeIds = new Set(state.players.map((entry) => entry.id));
  for (const [id, group] of onlinePlayers) {
    if (!activeIds.has(id)) {
      scene.remove(group);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
          else child.material.dispose();
        } else if (child instanceof THREE.Sprite) {
          child.material.map?.dispose();
          child.material.dispose();
        }
      });
      onlinePlayers.delete(id);
    }
  }

  for (const entry of state.players) {
    if (entry.id === localPlayerId) {
      if (onlineGame) {
        const shouldInitializeView = !hasInitializedLocalView || (!localAlive && entry.alive);
        if (shouldInitializeView) {
          camera.position.set(entry.position.x, entry.position.y, entry.position.z);
          physics?.setPosition(entry.position);
          player.yaw = entry.yaw;
          player.pitch = entry.pitch;
          hasInitializedLocalView = true;
        } else {
          const dx = camera.position.x - entry.position.x;
          const dy = camera.position.y - entry.position.y;
          const dz = camera.position.z - entry.position.z;
          if (
            dx * dx + dy * dy + dz * dz
            > LOCAL_POSITION_RECONCILIATION_DISTANCE_SQUARED
          ) {
            camera.position.set(entry.position.x, entry.position.y, entry.position.z);
            physics?.setPosition(entry.position);
          }
        }
      }
      continue;
    }

    let group = onlinePlayers.get(entry.id);
    if (
      !group
      || group.userData.team !== entry.team
      || group.userData.skinId !== entry.skinId
    ) {
      if (group) {
        scene.remove(group);
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            child.material.dispose();
          } else if (child instanceof THREE.Sprite) {
            child.material.map?.dispose();
            child.material.dispose();
          }
        });
      }
      group = createRemotePlayer(entry);
      onlinePlayers.set(entry.id, group);
    }
    group.userData.targetPosition.set(
      entry.position.x,
      entry.position.y - PLAYER_MODEL.eyeHeight,
      entry.position.z,
    );
    group.rotation.y = entry.yaw;
    group.visible = entry.alive;
  }
  if (onlineGame) updateCombatHud(state);
  if (state.match.status === 'finished' && state.match.winner) {
    showMatchResult({
      winner: state.match.winner,
      winnerName: state.match.winner === 'inter' ? 'Internacional' : 'Grêmio',
      killTarget: state.match.killTarget,
      teamKills: state.match.teamKills,
    });
  }
}

function showMatchResult(result) {
  matchFinished = true;
  fireHeld = false;
  pressedKeys.clear();
  matchResultTitle.textContent = `${result.winnerName} venceu!`;
  matchResultScore.textContent = `INTER ${result.teamKills.inter} × ${result.teamKills.gremio} GRÊMIO · META ${result.killTarget}`;
  matchResult.hidden = false;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function returnToLobby() {
  if (onlineGame) socket.emit('game:leave');
  onlineGame = false;
  localPlayerId = null;
  currentRoomId = null;
  localAlive = true;
  hasInitializedLocalView = false;
  matchFinished = false;
  fireHeld = false;
  pressedKeys.clear();
  combatHud.hidden = true;
  combatNotice.hidden = true;
  matchResult.hidden = true;
  killFeed.textContent = '';
  onlinePlayers.forEach((group) => {
    scene.remove(group);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material.dispose();
      } else if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    });
  });
  onlinePlayers.clear();
  arenaSelected = false;
  lobbyRoot.hidden = false;
  updateControlInterface();
}

function showCombatMessage(message) {
  combatNotice.textContent = message;
  combatNotice.hidden = false;
  window.setTimeout(() => {
    if (localAlive) combatNotice.hidden = true;
  }, 1800);
}

function handleServerShot(shot) {
  const visualOrigin = shot.visualStart ?? shot.start;
  const start = new THREE.Vector3(visualOrigin.x, visualOrigin.y, visualOrigin.z);
  const end = new THREE.Vector3(shot.end.x, shot.end.y, shot.end.z);
  addTracer(start, end);
  if (shot.shooterId !== localPlayerId) playShotSound();
  if (shot.hitId || shot.hitWorld) {
    const normal = start.clone().sub(end).normalize();
    addImpact(end, normal);
  }
}

function showReloadMessage(message, visible = true) {
  reloadStatus.textContent = message;
  reloadStatus.hidden = !visible;
}

function addTracer(start, end) {
  const length = start.distanceTo(end);
  if (length < 0.01) return;

  const tracer = new THREE.Group();
  tracer.position.copy(start).add(end).multiplyScalar(0.5);
  tracer.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    end.clone().sub(start).normalize(),
  );
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, length, 5),
    new THREE.MeshBasicMaterial({
      color: '#ff9b32',
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, length, 4),
    new THREE.MeshBasicMaterial({
      color: '#fff0a6',
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  tracer.add(outer, core);
  tracer.renderOrder = 2;
  scene.add(tracer);
  tracerEffects.push({
    object: tracer,
    expiresAt: clock.elapsedTime + 0.14,
  });
}

function addImpact(point, normal) {
  const group = new THREE.Group();
  group.position.copy(point).addScaledVector(normal, 0.012);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

  const markMaterial = new THREE.MeshBasicMaterial({
    color: '#211d17',
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mark = new THREE.Mesh(new THREE.CircleGeometry(0.055, 6), markMaterial);
  mark.position.z = 0.002;
  group.add(mark);

  const sparkMaterial = new THREE.LineBasicMaterial({
    color: '#edaa42',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const sparkGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.09, 0, 0.003),
    new THREE.Vector3(0.09, 0, 0.003),
    new THREE.Vector3(0, -0.07, 0.004),
    new THREE.Vector3(0, 0.07, 0.004),
  ]);
  const sparks = new THREE.LineSegments(sparkGeometry, sparkMaterial);
  group.add(sparks);
  group.userData.materials = [markMaterial, sparkMaterial];
  scene.add(group);
  impactEffects.push({
    object: group,
    materials: group.userData.materials,
    expiresAt: clock.elapsedTime + impactLifetime,
    lifetime: impactLifetime,
  });
}

function shoot() {
  if (!physics || (document.pointerLockElement !== canvas && !fallbackControls)) {
    return;
  }
  if (onlineGame && (!localAlive || matchFinished)) return;

  const now = clock.elapsedTime;
  const result = fireRound(rifleState, now);
  if (result === 'empty') {
    showReloadMessage('SEM MUNIÇÃO · PRESSIONE R');
    return;
  }
  if (result !== 'fired') {
    return;
  }

  showReloadMessage('', false);
  updateAmmoHud();
  recoil = 1;
  nextMuzzleFlashEnd = now + 0.055;
  weapon.userData.muzzleFlash.visible = true;
  weapon.userData.flashLight.intensity = 4;
  playShotSound();

  camera.updateMatrixWorld(true);
  weapon.updateMatrixWorld(true);
  camera.getWorldDirection(shotDirection);
  if (onlineGame) {
    socket.emit('game:input', {
      keys: [...pressedKeys],
      yaw: player.yaw,
      pitch: player.pitch,
      jump: false,
    });
    socket.timeout(3000).emit('game:shoot', {}, (error, response) => {
      if (error || response?.error) {
        if (response?.error === 'Sem munição no carregador.') {
          rifleState.magazine = response.magazine ?? 0;
          updateAmmoHud();
          showReloadMessage('SEM MUNIÇÃO · PRESSIONE R');
        }
        return;
      }
      rifleState.magazine = response.magazine;
      rifleState.reserve = response.reserve;
      updateAmmoHud();
    });
    return;
  }

  raycaster.setFromCamera(screenCenter, camera);
  const [aimHit] = raycaster.intersectObjects(shootableObjects, false);
  if (aimHit) {
    shotEnd.copy(aimHit.point);
  } else {
    shotEnd.copy(raycaster.ray.origin).addScaledVector(shotDirection, shotRange);
  }

  if (aimHit) {
    impactNormal.copy(aimHit.face?.normal ?? new THREE.Vector3(0, 1, 0))
      .transformDirection(aimHit.object.matrixWorld);
    addImpact(aimHit.point, impactNormal);
  }

  weapon.userData.muzzle.getWorldPosition(muzzlePosition);
  addTracer(muzzlePosition, shotEnd);
}

function beginReload() {
  if (onlineGame && matchFinished) return;
  const now = clock.elapsedTime;
  if (onlineGame) {
    socket.timeout(3000).emit('game:reload', {}, (error, response) => {
      if (error || response?.error) return;
      if (startReload(rifleState, now)) {
        fireHeld = false;
        showReloadMessage('RECARREGANDO...');
      }
    });
    return;
  }
  if (startReload(rifleState, now)) {
    fireHeld = false;
    showReloadMessage('RECARREGANDO...');
    return;
  }

  if (rifleState.magazine < 30 && rifleState.reserve === 0) {
    showReloadMessage('SEM MUNIÇÃO RESERVA');
  }
}

function updateTransientEffects(now) {
  for (let index = tracerEffects.length - 1; index >= 0; index -= 1) {
    const effect = tracerEffects[index];
    if (effect.expiresAt > now) {
      continue;
    }

    scene.remove(effect.object);
    effect.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
    tracerEffects.splice(index, 1);
  }

  for (let index = impactEffects.length - 1; index >= 0; index -= 1) {
    const effect = impactEffects[index];
    const remaining = effect.expiresAt - now;
    if (remaining <= 0) {
      scene.remove(effect.object);
      effect.object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
        }
      });
      effect.materials.forEach((material) => material.dispose());
      impactEffects.splice(index, 1);
      continue;
    }

    const opacity = remaining / effect.lifetime;
    effect.materials.forEach((material) => {
      material.opacity = opacity;
    });
  }
}

updateAmmoHud();

function updateControlInterface() {
  const isPlaying = document.pointerLockElement === canvas || fallbackControls;
  startPanel.hidden = isPlaying || !arenaSelected;
  controlStatus.hidden = !fallbackControls && !physicsLoading;
  if (physicsLoading) {
    controlStatus.textContent = 'Carregando física da arena...';
  } else if (fallbackControls) {
    controlStatus.textContent = 'Mouse sem captura: mova sobre a arena para olhar. ESC para pausar.';
  }

  document.querySelector('.game-shell')?.classList.toggle('is-playing', isPlaying);
  document.querySelector('.game-shell')?.classList.toggle('is-fallback', fallbackControls);
}

document.addEventListener('lobby:enter-arena', (event) => {
  const gameState = event.detail?.state;
  onlineGame = true;
  localPlayerId = event.detail?.playerId ?? null;
  currentRoomId = gameState?.roomId ?? null;
  localAlive = true;
  hasInitializedLocalView = false;
  matchFinished = false;
  matchResult.hidden = true;
  if (gameState) applyGameState(gameState);
  arenaSelected = true;
  requestPointerLock();
});

returnLobbyButton.addEventListener('click', returnToLobby);
matchReturnButton.addEventListener('click', returnToLobby);

function enableFallbackControls() {
  fallbackControls = true;
  previousPointerPosition = null;
  ignoreNextMouseMove = true;
  pressedKeys.clear();
  errorMessage.hidden = true;
  updateControlInterface();
}

async function loadPhysics() {
  if (!physicsPromise) {
    physicsLoading = true;
    enterButton.disabled = true;
    enterButton.textContent = 'CARREGANDO FÍSICA...';
    updateControlInterface();
    physicsPromise = import('./physics/arenaPhysics.js')
      .then(({ createArenaPhysics }) => createArenaPhysics({
        crateLayout,
        pillarLayout,
        containerLayout,
        coverLayout,
        wallLayout,
      }));
  }

  try {
    physics = await physicsPromise;
  } catch (error) {
    physicsPromise = undefined;
    fallbackControls = false;
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    errorMessage.hidden = false;
    errorMessage.textContent = 'Falha ao carregar a física da arena. Recarregue a página para tentar novamente.';
    console.error('Falha ao carregar Rapier:', error);
  } finally {
    physicsLoading = false;
    enterButton.disabled = false;
    enterButton.textContent = 'INICIAR TESTE';
    updateControlInterface();
  }
}

function requestPointerLock() {
  const lockRequest = (() => {
    try {
      return canvas.requestPointerLock();
    } catch {
      enableFallbackControls();
      return undefined;
    }
  })();

  if (lockRequest instanceof Promise) {
    lockRequest.catch(enableFallbackControls);
  }

  void loadPhysics();
}

enterButton.addEventListener('click', requestPointerLock);

document.addEventListener('pointerlockchange', () => {
  const isLocked = document.pointerLockElement === canvas;
  previousPointerPosition = null;
  ignoreNextMouseMove = true;
  if (isLocked) {
    fallbackControls = false;
    errorMessage.hidden = true;
    pressedKeys.clear();
  } else {
    fallbackControls = false;
    pressedKeys.clear();
    jumpPending = false;
    if (onlineGame) {
      socket.emit('game:input', {
        keys: [],
        yaw: player.yaw,
        pitch: player.pitch,
      });
    }
  }
  updateControlInterface();
});

document.addEventListener('pointerlockerror', enableFallbackControls);

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) {
    return;
  }
  if (document.pointerLockElement !== canvas && !fallbackControls) {
    return;
  }

  event.preventDefault();
  fireHeld = true;
  shoot();
});

document.addEventListener('pointerup', (event) => {
  if (event.button === 0) {
    fireHeld = false;
  }
});

document.addEventListener('pointercancel', () => {
  fireHeld = false;
});

window.addEventListener('blur', () => {
  fireHeld = false;
  pressedKeys.clear();
});

document.addEventListener('contextmenu', (event) => {
  if (document.pointerLockElement === canvas || fallbackControls) {
    event.preventDefault();
  }
});

document.addEventListener('mousemove', (event) => {
  if (ignoreNextMouseMove) {
    ignoreNextMouseMove = false;
    return;
  }

  let deltaX = event.movementX;
  let deltaY = event.movementY;

  if (document.pointerLockElement === canvas) {
    previousPointerPosition = null;
  } else if (fallbackControls) {
    const bounds = canvas.getBoundingClientRect();
    const isOverCanvas = event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;

    if (!isOverCanvas) {
      previousPointerPosition = null;
      return;
    }

    if (previousPointerPosition) {
      deltaX = event.clientX - previousPointerPosition.x;
      deltaY = event.clientY - previousPointerPosition.y;
    } else {
      deltaX = 0;
      deltaY = 0;
    }

    previousPointerPosition = { x: event.clientX, y: event.clientY };
  } else {
    return;
  }

  player.yaw -= clampLookDelta(deltaX) * mouseSensitivity;
  player.pitch -= clampLookDelta(deltaY) * mouseSensitivity;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -Math.PI / 2.5, Math.PI / 2.5);
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && document.pointerLockElement === canvas) {
    event.preventDefault();
    document.exitPointerLock();
    return;
  }

  if (event.code === 'Escape' && fallbackControls) {
    event.preventDefault();
    fallbackControls = false;
    pressedKeys.clear();
    updateControlInterface();
    return;
  }

  if (document.pointerLockElement !== canvas && !fallbackControls) {
    return;
  }

  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    event.preventDefault();
    pressedKeys.add(event.code);
  }

  if (event.code === 'Space' && !event.repeat && player.grounded) {
    player.verticalVelocity = 6.2;
    player.grounded = false;
    jumpPending = true;
  }

  if (event.code === 'KeyR' && !event.repeat) {
    event.preventDefault();
    beginReload();
  }
});

document.addEventListener('keyup', (event) => {
  pressedKeys.delete(event.code);
});

socket.on('game:state', applyGameState);
socket.on('game:shot', handleServerShot);
socket.on('game:event', (event) => {
  if (event.type === 'match-ended') {
    showMatchResult(event);
  } else if (event.type === 'kill') {
    const message = `${event.killerNickname} eliminou ${event.victimNickname}${event.killerId === localPlayerId ? ' · ELIMINAÇÃO!' : ''}`;
    killFeed.textContent = message;
    window.setTimeout(() => {
      if (killFeed.textContent === message) killFeed.textContent = '';
    }, 3500);
    if (event.victimId === localPlayerId) {
      fireHeld = false;
      showCombatMessage('ELIMINADO · AGUARDE O RESPAWN');
    } else if (event.killerId === localPlayerId) {
      showCombatMessage('ELIMINAÇÃO CONFIRMADA');
    }
  } else if (event.type === 'respawn' && event.playerId === localPlayerId) {
    showCombatMessage('VOCÊ VOLTOU AO COMBATE');
  }
});

socket.on('disconnect', () => {
  if (onlineGame) {
    showCombatMessage('CONEXÃO PERDIDA · TENTANDO RECONECTAR');
  }
});

function resizeRenderer() {
  const width = Math.max(1, Math.floor(window.innerWidth / 2.25));
  const height = Math.max(1, Math.floor(window.innerHeight / 2.25));
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  const isPlaying = document.pointerLockElement === canvas || fallbackControls;

  if (completeReload(rifleState, elapsed)) {
    updateAmmoHud();
    showReloadMessage('', false);
  }

  updateTransientEffects(elapsed);
  if (elapsed >= nextMuzzleFlashEnd) {
    weapon.userData.muzzleFlash.visible = false;
    weapon.userData.flashLight.intensity = 0;
  }

  if (fireHeld && isPlaying && !matchFinished && elapsed - rifleState.lastShotAt >= SHOT_INTERVAL) {
    shoot();
  }

  if (isPlaying && physics && (!onlineGame || localAlive) && !matchFinished) {
    const input = getMovementInput(pressedKeys);
    const speed = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') ? 9 : 5.5;
    const isMoving = input.x !== 0 || input.z !== 0;
    const horizontal = rotateMovement(input, player.yaw, speed * delta);

    if (player.grounded && player.verticalVelocity < 0) {
      player.verticalVelocity = 0;
    }

    player.verticalVelocity -= 16 * delta;
    const position = physics.move({
      x: horizontal.x,
      y: player.verticalVelocity * delta,
      z: horizontal.z,
    });
    camera.position.set(position.x, position.y, position.z);
    player.grounded = position.grounded;
    if (player.grounded && player.verticalVelocity < 0) {
      player.verticalVelocity = 0;
    }

    const bob = isMoving && player.grounded ? Math.sin(elapsed * (speed === 9 ? 15 : 10)) : 0;
    recoil = THREE.MathUtils.damp(recoil, 0, 11, delta);
    weapon.position.copy(weapon.userData.basePosition);
    weapon.position.y += bob * 0.012 - recoil * 0.045;
    weapon.position.x += Math.abs(bob) * 0.008;
    weapon.rotation.copy(weapon.userData.baseRotation);
    weapon.rotation.z += bob * 0.012;
    weapon.rotation.x += recoil * 0.055;
  } else {
    weapon.position.copy(weapon.userData.basePosition);
    weapon.rotation.copy(weapon.userData.baseRotation);
  }

  camera.rotation.set(player.pitch, player.yaw, 0);
  if (onlineGame && isPlaying && !matchFinished && elapsed - lastInputSentAt >= 0.05) {
    socket.emit('game:input', {
      keys: localAlive ? [...pressedKeys] : [],
      yaw: player.yaw,
      pitch: player.pitch,
      jump: jumpPending,
    });
    jumpPending = false;
    lastInputSentAt = elapsed;
  }
  onlinePlayers.forEach((group) => {
    group.position.lerp(group.userData.targetPosition, 1 - Math.exp(-delta * 14));
  });
  renderer.render(scene, camera);
}

window.addEventListener('resize', resizeRenderer);
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
  physics?.dispose();
}, { once: true });
resizeRenderer();
renderer.setAnimationLoop(animate);
