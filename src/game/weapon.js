import * as THREE from 'three';

export const MUZZLE_LOCAL_POSITION = Object.freeze({ x: 0, y: 0.02, z: -1.12 });
export const WEAPON_VIEW_POSITION = Object.freeze({ x: 0.39, y: -0.31, z: -0.78 });
export const WEAPON_VIEW_ROTATION = Object.freeze({ x: 0.035, y: 0.04, z: -0.025 });

export function getMuzzleOffset(yaw, pitch) {
  const weaponOffset = new THREE.Vector3(
    MUZZLE_LOCAL_POSITION.x,
    MUZZLE_LOCAL_POSITION.y,
    MUZZLE_LOCAL_POSITION.z,
  )
    .applyEuler(new THREE.Euler(
      WEAPON_VIEW_ROTATION.x,
      WEAPON_VIEW_ROTATION.y,
      WEAPON_VIEW_ROTATION.z,
    ))
    .add(new THREE.Vector3(
      WEAPON_VIEW_POSITION.x,
      WEAPON_VIEW_POSITION.y,
      WEAPON_VIEW_POSITION.z,
    ));

  return weaponOffset.applyQuaternion(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')),
  );
}

function addWeaponPart(group, geometry, material, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function createRifleViewModel(camera) {
  const weapon = new THREE.Group();
  weapon.name = 'low-poly-service-rifle';
  weapon.position.set(
    WEAPON_VIEW_POSITION.x,
    WEAPON_VIEW_POSITION.y,
    WEAPON_VIEW_POSITION.z,
  );
  weapon.rotation.set(
    WEAPON_VIEW_ROTATION.x,
    WEAPON_VIEW_ROTATION.y,
    WEAPON_VIEW_ROTATION.z,
  );

  const polymer = new THREE.MeshStandardMaterial({
    color: '#464b43',
    roughness: 0.92,
    flatShading: true,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: '#2a302e',
    metalness: 0.55,
    roughness: 0.62,
    flatShading: true,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: '#818c86',
    metalness: 0.72,
    roughness: 0.4,
    flatShading: true,
  });
  const gripMaterial = new THREE.MeshStandardMaterial({
    color: '#695a43',
    roughness: 1,
    flatShading: true,
  });
  const sleeveMaterial = new THREE.MeshStandardMaterial({
    color: '#626b5b',
    roughness: 1,
    flatShading: true,
  });
  const gloveMaterial = new THREE.MeshStandardMaterial({
    color: '#625640',
    roughness: 1,
    flatShading: true,
  });
  const sightMaterial = new THREE.MeshStandardMaterial({
    color: '#c5a45e',
    emissive: '#6e4a18',
    emissiveIntensity: 0.2,
    roughness: 0.8,
  });

  addWeaponPart(weapon, new THREE.BoxGeometry(0.24, 0.2, 0.48), polymer, [0, 0, -0.08]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.2, 0.075, 0.42), darkMetal, [0, 0.125, -0.12]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.21, 0.15, 0.27), steel, [0, 0.015, -0.39]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.19, 0.13, 0.34), polymer, [0, 0.015, 0.34]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.13, 0.24, 0.16), gripMaterial, [0, -0.2, 0.12], [0.18, 0, 0]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.14, 0.25, 0.17), polymer, [0, -0.19, -0.12], [0.14, 0, 0]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.17, 0.19, 0.42), sleeveMaterial, [0.21, -0.34, 0.31], [-0.28, 0, -0.08]);
  addWeaponPart(weapon, new THREE.SphereGeometry(0.095, 7, 5), gloveMaterial, [0.16, -0.245, 0.095]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.16, 0.18, 0.32), sleeveMaterial, [-0.18, -0.25, -0.39], [0.18, 0, 0.05]);
  addWeaponPart(weapon, new THREE.SphereGeometry(0.09, 7, 5), gloveMaterial, [-0.12, -0.15, -0.38]);

  const barrel = addWeaponPart(
    weapon,
    new THREE.CylinderGeometry(0.044, 0.052, 0.58, 8),
    darkMetal,
    [0, 0.02, -0.77],
    [Math.PI / 2, 0, 0],
  );
  barrel.name = 'rifle-barrel';
  const muzzleDevice = addWeaponPart(
    weapon,
    new THREE.CylinderGeometry(0.075, 0.075, 0.08, 8),
    steel,
    [0, 0.02, -1.08],
    [Math.PI / 2, 0, 0],
  );
  muzzleDevice.name = 'rifle-muzzle-device';

  addWeaponPart(weapon, new THREE.BoxGeometry(0.24, 0.035, 0.28), darkMetal, [0, 0.105, -0.48]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.045, 0.13, 0.055), steel, [0, 0.19, -0.53]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.035, 0.055, 0.045), steel, [0, 0.22, -1.02]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.05, 0.045, 0.09), sightMaterial, [0, 0.19, -0.76]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.035, 0.045, 0.18), steel, [0.112, 0.015, -0.38]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.035, 0.045, 0.18), steel, [-0.112, 0.015, -0.38]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.018, 0.035, 0.3), steel, [0.126, 0.045, -0.08]);
  addWeaponPart(weapon, new THREE.BoxGeometry(0.018, 0.035, 0.3), steel, [-0.126, 0.045, -0.08]);

  weapon.userData.basePosition = weapon.position.clone();
  weapon.userData.baseRotation = weapon.rotation.clone();
  weapon.userData.muzzle = new THREE.Object3D();
  weapon.userData.muzzle.position.set(
    MUZZLE_LOCAL_POSITION.x,
    MUZZLE_LOCAL_POSITION.y,
    MUZZLE_LOCAL_POSITION.z,
  );
  weapon.add(weapon.userData.muzzle);
  const flash = new THREE.Group();
  flash.name = 'muzzle-flash';
  flash.visible = false;
  weapon.userData.muzzleFlash = flash;
  weapon.userData.muzzle.add(flash);

  const outerFlash = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.38, 6),
    new THREE.MeshBasicMaterial({
      color: '#ff9b32',
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  outerFlash.rotation.x = -Math.PI / 2;
  outerFlash.position.z = -0.19;
  flash.add(outerFlash);

  const innerFlash = new THREE.Mesh(
    new THREE.ConeGeometry(0.065, 0.28, 5),
    new THREE.MeshBasicMaterial({
      color: '#fff2b0',
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  innerFlash.rotation.x = -Math.PI / 2;
  innerFlash.position.z = -0.13;
  flash.add(innerFlash);

  const flashLight = new THREE.PointLight('#ffb637', 0, 2.5, 2);
  weapon.userData.flashLight = flashLight;
  flash.add(flashLight);

  camera.add(weapon);

  const weaponLight = new THREE.PointLight('#f2dfbd', 1.2, 2.5, 2);
  weaponLight.position.set(0.1, 0.35, -0.2);
  camera.add(weaponLight);

  return weapon;
}
