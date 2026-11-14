/**
 * Beam depression toward the floor, in degrees.
 * 0 is a horizontal beam and applies no skew.
 * 90 points straight down. That is the full keystone, so the gobo lands square on the floor.
 */
export const PROJECTOR_MIN = 0;
export const PROJECTOR_MAX = 90;

/** Perspective tilt used when the beam is straight down. Short of edge-on, so the gobo stays visible. */
const FULL_TILT_DEGREES = 72;

const FIT_MARGIN_PX = 28;

/**
 * Pre-warp for a beam depressed by `angleDeg` onto the floor.
 * The top of the gobo is the far edge and narrows as the beam aims further down.
 * Zero is only the centering translation. The result stays on the stage.
 */
export function projectorTransform(
  angleDeg: number,
  cssSize: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const angle = Number.isFinite(angleDeg) ? Math.min(PROJECTOR_MAX, Math.max(PROJECTOR_MIN, angleDeg)) : 0;
  if (angle < 0.05 || cssSize <= 0) return "translate(-50%, -50%)";

  const tilt = (angle / PROJECTOR_MAX) * FULL_TILT_DEGREES;
  const rad = (tilt * Math.PI) / 180;
  const distance = Math.max(cssSize * 0.7, 1);
  const half = cssSize / 2;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const maxX = Math.max(1, viewportWidth / 2 - FIT_MARGIN_PX);
  const maxY = Math.max(1, viewportHeight / 2 - FIT_MARGIN_PX);
  const limit = Math.min(maxX, maxY / Math.max(cos, 0.05));
  const foreshorten = (half * sin) / distance;
  const fit = Math.min(1, limit / (half + foreshorten * limit));
  const scale = Number.isFinite(fit) && fit > 0 ? fit : 1;
  return `translate(-50%, -50%) perspective(${distance}px) rotateX(${tilt}deg) scale(${scale})`;
}
