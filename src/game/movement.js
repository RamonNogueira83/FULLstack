export function getMovementInput(pressedKeys) {
  const input = {
    x: Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA')),
    z: Number(pressedKeys.has('KeyS')) - Number(pressedKeys.has('KeyW')),
  };
  const magnitude = Math.hypot(input.x, input.z);

  if (magnitude > 0) {
    input.x /= magnitude;
    input.z /= magnitude;
  }

  return input;
}

export function rotateMovement(input, yaw, distance) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  return {
    x: (input.x * cos + input.z * sin) * distance,
    z: (-input.x * sin + input.z * cos) * distance,
  };
}
