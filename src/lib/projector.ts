/**
 * Beam angle, in degrees, from 0 to 90.
 * Floor: 0 is a horizontal beam and gets the full keystone. 90 points straight down and has no skew.
 * Wall: 0 aims straight at the surface with no skew. 90 is pitched fully off that aim.
 * The far edge is the top of the gobo. It narrows so the mark lands square.
 */
export const PROJECTOR_MIN = 0;
export const PROJECTOR_MAX = 90;

/** Perspective tilt at full keystone. Short of edge-on, so the gobo stays visible. */
const FULL_TILT_DEGREES = 72;

const FIT_MARGIN_PX = 28;

/**
 * Pre-warp for `angleDeg` on `surface`.
 * Floor skew falls as the beam aims down. Wall skew rises as the beam pitches off the wall.
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
  if (cssSize <= 0) return "translate(-50%, -50%)";
  const skew = surface === "floor" ? (PROJECTOR_MAX - angle) / PROJECTOR_MAX : angle / PROJECTOR_MAX;
  const tilt = skew * FULL_TILT_DEGREES;
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
