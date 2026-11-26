export const PLAYER_MODEL = Object.freeze({
  eyeHeight: 1.71,
  bodyCenterY: 0.98,
  bodyRadius: 0.55,
  headCenterY: 1.62,
  headRadius: 0.27,
});

export const PLAYER_SKINS = Object.freeze([
  Object.freeze({
    id: 'neon-courier',
    name: 'NEON COURIER',
    style: 'Mensageiro cyberpunk',
    body: '#263b49',
    armor: '#31aaa9',
    accent: '#e65e98',
    visor: '#14282d',
    helmet: '#294957',
    headStyle: 'visor',
  }),
  Object.freeze({
    id: 'orbit-salvager',
    name: 'ORBIT SALVAGER',
    style: 'Piloto pulp espacial',
    body: '#c0b9a2',
    armor: '#cb7542',
    accent: '#e0cf9a',
    visor: '#26333a',
    helmet: '#d1c8ad',
    headStyle: 'pilot',
  }),
  Object.freeze({
    id: 'dune-drifter',
    name: 'DUNE DRIFTER',
    style: 'Explorador pós-apocalíptico',
    body: '#555846',
    armor: '#8a754f',
    accent: '#cfad66',
    visor: '#282923',
    helmet: '#716749',
    headStyle: 'hood',
  }),
]);

export const DEFAULT_SKIN_ID = PLAYER_SKINS[0].id;

export function getPlayerSkin(skinId) {
  return PLAYER_SKINS.find((skin) => skin.id === skinId) ?? PLAYER_SKINS[0];
}

export function isPlayerSkinId(skinId) {
  return PLAYER_SKINS.some((skin) => skin.id === skinId);
}
