import * as RAPIER from '@dimforge/rapier3d-compat';

function addFixedCollider(world, shape, translation, rotation = { x: 0, y: 0, z: 0, w: 1 }) {
  const descriptor = shape
    .setTranslation(...translation)
    .setRotation(rotation)
    .setFriction(0);
  world.createCollider(descriptor);
}

export async function createArenaPhysics({
  crateLayout,
  pillarLayout,
  containerLayout = [],
  coverLayout = [],
  wallLayout = [],
  spawn = { x: 0, y: 0.84, z: 16 },
}) {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;

  addFixedCollider(
    world,
    RAPIER.ColliderDesc.cuboid(20, 0.1, 20),
    [0, -0.16, 0],
  );

  const wallHeight = 5;
  const wallWidth = 10;
  for (let index = 0; index < 4; index += 1) {
    const offset = -20 + index * wallWidth;
    const center = wallHeight / 2;
    const wall = (width, depth, position) => addFixedCollider(
      world,
      RAPIER.ColliderDesc.cuboid(width / 2, wallHeight / 2, depth / 2),
      position,
    );

    wall(wallWidth, 1, [offset + wallWidth / 2, center, -19.5]);
    wall(wallWidth, 1, [offset + wallWidth / 2, center, 19.5]);
    wall(1, wallWidth, [-19.5, center, offset + wallWidth / 2]);
    wall(1, wallWidth, [19.5, center, offset + wallWidth / 2]);
  }

  wallLayout.forEach(([x, y, z, width, height, depth, yaw]) => {
    const rotation = {
      x: 0,
      y: Math.sin(yaw / 2),
      z: 0,
      w: Math.cos(yaw / 2),
    };
    addFixedCollider(
      world,
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2),
      [x, y, z],
      rotation,
    );
  });

  containerLayout.forEach(([x, y, z, width, height, depth, yaw]) => {
    const rotation = {
      x: 0,
      y: Math.sin(yaw / 2),
      z: 0,
      w: Math.cos(yaw / 2),
    };
    addFixedCollider(
      world,
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2),
      [x, y, z],
      rotation,
    );
  });

  coverLayout.forEach(([x, y, z, width, height, depth, yaw]) => {
    const rotation = {
      x: 0,
      y: Math.sin(yaw / 2),
      z: 0,
      w: Math.cos(yaw / 2),
    };
    addFixedCollider(
      world,
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2),
      [x, y, z],
      rotation,
    );
  });

  crateLayout.forEach(([x, y, z, width, height, depth], index) => {
    const angle = index % 2 === 0 ? Math.PI / 4 : 0;
    const rotation = {
      x: 0,
      y: Math.sin(angle / 2),
      z: 0,
      w: Math.cos(angle / 2),
    };
    addFixedCollider(
      world,
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2),
      [x, y, z],
      rotation,
    );
  });

  pillarLayout.forEach(([x, y, z]) => {
    addFixedCollider(
      world,
      RAPIER.ColliderDesc.cylinder(2.6, 0.95),
      [x, y, z],
    );
  });

  const platformRotation = {
    x: 0,
    y: Math.sin(Math.PI / 8),
    z: 0,
    w: Math.cos(Math.PI / 8),
  };
  addFixedCollider(
    world,
    RAPIER.ColliderDesc.cuboid(1.6, 0.25, 1.6),
    [0, 0.25, 0],
    platformRotation,
  );

  const characterBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawn.x, spawn.y, spawn.z),
  );
  const characterCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.55, 0.35)
      .setFriction(0)
      .setMass(1),
    characterBody,
  );
  const characterController = world.createCharacterController(0.02);
  characterController.setUp({ x: 0, y: 1, z: 0 });
  characterController.setSlideEnabled(true);
  characterController.setMaxSlopeClimbAngle(Math.PI / 4);
  characterController.enableAutostep(0.35, 0.2, false);
  characterController.enableSnapToGround(0.18);

  return {
    setPosition(position) {
      characterBody.setTranslation({
        x: position.x,
        y: position.y - 0.81,
        z: position.z,
      }, true);
      world.step();
    },
    move(displacement) {
      const current = characterBody.translation();
      characterController.computeColliderMovement(characterCollider, displacement);
      const movement = characterController.computedMovement();
      characterBody.setNextKinematicTranslation({
        x: current.x + movement.x,
        y: current.y + movement.y,
        z: current.z + movement.z,
      });
      world.step();

      const position = characterBody.translation();
      return {
        x: position.x,
        y: position.y + 0.81,
        z: position.z,
        grounded: characterController.computedGrounded(),
      };
    },
    dispose() {
      characterController.free();
      world.free();
    },
  };
}
