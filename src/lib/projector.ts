/**
 * Beam angle, in degrees, from 0 to 90.
 * Floor: 0 is a horizontal beam and gets the full keystone. 90 points straight down and has no skew.
 * Wall: 0 aims straight at the surface with no skew. 90 is pitched fully off that aim.
 * The far edge is the top of the gobo. It narrows so the mark lands square.
 */
export const PROJECTOR_MIN = 0;
export const PROJECTOR_MAX = 90;

/** Perspective tilt at full wall keystone. Short of edge-on, so the gobo stays visible. */
const FULL_TILT_DEGREES = 72;

const FIT_MARGIN_PX = 28;

/**
 * Half the floor gobo, as a fraction of the distance from the point under the
 * projector to the gobo's center. This is the throw that sets the keystone.
 */
const FLOOR_THROW = 0.4;

/**
 * Far-edge width divided by near-edge width for a beam depressed by `angleDeg`.
 * 90° (straight down) is 1. A horizontal beam is the strongest taper.
 * The gobo keeps a fixed share of the throw, so the footprint is the perspective
 * projection of a floor rectangle: (1 - μ cos²θ) / (1 + μ cos²θ).
 */
export function floorKeystoneRatio(angleDeg: number) {
  const angle = Number.isFinite(angleDeg) ? Math.min(PROJECTOR_MAX, Math.max(PROJECTOR_MIN, angleDeg)) : 0;
  const cos = Math.cos((angle * Math.PI) / 180);
  const cover = FLOOR_THROW * cos * cos;
  return (1 - cover) / (1 + cover);
}

/**
 * Wall keystone, as a CSS transform. Floor keystone is painted into the gobo from the throw angle.
 * Zero skew is only the centering translation. The result stays on the stage.
 */
export function projectorTransform(
  angleDeg: number,
  cssSize: number,
  viewportWidth: number,
  viewportHeight: number,
  surface: "floor" | "wall" = "floor",
) {
  const angle = Number.isFinite(angleDeg) ? Math.min(PROJECTOR_MAX, Math.max(PROJECTOR_MIN, angleDeg)) : 0;
  if (cssSize <= 0 || surface === "floor") return "translate(-50%, -50%)";
  const tilt = (angle / PROJECTOR_MAX) * FULL_TILT_DEGREES;
  if (tilt < 0.05) return "translate(-50%, -50%)";

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
