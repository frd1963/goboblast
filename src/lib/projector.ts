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
const FLOOR_THROW = 0.55;

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
 * Perspective transform for a floor gobo that has already been cropped to its ink.
 * 90° is square. Lower angles tip the beam so the top (far) edge narrows and the
 * bottom (near) edge widens by the throw ratio. The crop is what makes the letters
 * themselves keystone.
 */
export function floorThrowTransform(
  angleDeg: number,
  cssWidth: number,
  cssHeight: number,
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const center = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
  const ratio = floorKeystoneRatio(angleDeg);
  if (cssWidth <= 0 || cssHeight <= 0 || ratio > 0.985) return center;
  const k = (1 - ratio) / (1 + ratio);
  const tilt = Math.min(32, (1 - ratio) * 58);
  const rad = (tilt * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const distance = Math.max(1, ((cssHeight / 2) * sin) / Math.max(k, 0.0001));
  const project = (x: number, y: number, fit: number) => {
    const z = y * fit * sin;
    const scale = (distance * fit) / (distance * fit - z);
    return [x * fit * scale, y * fit * cos * scale] as const;
  };
  const corners = [
    [-cssWidth / 2, -cssHeight / 2],
    [cssWidth / 2, -cssHeight / 2],
    [-cssWidth / 2, cssHeight / 2],
    [cssWidth / 2, cssHeight / 2],
  ];
  const limitX = Math.max(1, viewportWidth / 2 - FIT_MARGIN_PX);
  const limitY = Math.max(1, viewportHeight / 2 - FIT_MARGIN_PX);
  let fit = 1;
  for (const [x, y] of corners) {
    const [px, py] = project(x, y, 1);
    fit = Math.min(fit, limitX / (Math.abs(px) + Math.abs(offsetX)), limitY / (Math.abs(py) + Math.abs(offsetY)));
  }
  if (!Number.isFinite(fit) || fit <= 0) fit = 1;
  fit = Math.min(1, fit);
  return `${center} perspective(${distance * fit}px) rotateX(${tilt}deg) scale(${fit})`;
}

/**
 * Wall keystone, as a CSS transform. Floor keystone is a throw-angle perspective on the gobo itself.
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
