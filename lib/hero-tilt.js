/** @typedef {{ x: number, y: number }} Tilt */

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** Unified headline tilt (one pivot, even across the block). */
/** @param {Tilt} tilt */
export function tiltTransform({ x, y }) {
  return `perspective(1200px) rotateX(${y.toFixed(2)}deg) rotateY(${x.toFixed(2)}deg)`;
}

/** Desktop pointer → tilt degrees (x = rotateY, y = rotateX). */
/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} vw
 * @param {number} vh
 * @param {{ maxX?: number, maxY?: number }} [opts]
 * @returns {Tilt}
 */
export function mouseToTilt(clientX, clientY, vw, vh, { maxX = 5, maxY = 4 } = {}) {
  if (!vw || !vh) return { x: 0, y: 0 };
  const nx = (clientX / vw - 0.5) * 2;
  const ny = (clientY / vh - 0.5) * 2;
  return {
    x: clamp(nx * maxX, -maxX, maxX) || 0,
    y: clamp(-ny * maxY, -maxY, maxY) || 0,
  };
}

/** DeviceOrientation beta/gamma → tilt degrees. */
/**
 * @param {number | null} beta
 * @param {number | null} gamma
 * @param {{ holdAngle?: number, maxX?: number, maxY?: number }} [opts]
 * @returns {Tilt}
 */
export function orientationToTilt(beta, gamma, { holdAngle = 45, maxX = 6, maxY = 5 } = {}) {
  return {
    x: clamp((gamma ?? 0) / 3, -maxX, maxX),
    y: clamp(((beta ?? holdAngle) - holdAngle) / 4, -maxY, maxY),
  };
}

/** Smooth step toward target. */
/**
 * @param {Tilt} current
 * @param {Tilt} target
 * @param {number} [factor]
 * @returns {Tilt}
 */
export function lerpTilt(current, target, factor = 0.12) {
  const x = current.x + (target.x - current.x) * factor;
  const y = current.y + (target.y - current.y) * factor;
  if (Math.abs(x - target.x) < 0.02 && Math.abs(y - target.y) < 0.02) {
    return { x: target.x, y: target.y };
  }
  return { x, y };
}
