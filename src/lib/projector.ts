/**
 * Beam angle, in degrees, from 0 to 90.
 * Floor: 0 is a horizontal beam and gets the full keystone. 90 points straight down and has no skew.
 * Wall: 0 aims straight at the surface with no skew. 90 is pitched fully off that aim.
 * The far edge is the top of the gobo. It narrows so the mark lands square on the surface.
 *
 * The gobo is rotated rigidly inside a fixed square, then this one homography is applied
 * to that whole square. The homography depends on the surface, the projector angle, and
 * the square's size. It does not depend on the rotation. On the floor or wall the word
 * stays a constant size. On the screen, a strong keystone still changes the shape as the
 * word swings through the taper — that variation is the projection, not a size change.
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

/** Row-major 3×3. Surface (x, y, 1) maps to screen (X, Y, W). Origin is the frame center. */
export type HomographyMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type Keystone = {
  matrix: HomographyMatrix;
  css: string;
};

const IDENTITY: HomographyMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Far-edge width divided by near-edge width for a beam depressed by `angleDeg`.
 * 90° (straight down) is 1. A horizontal beam is the strongest taper.
 * The gobo keeps a fixed share of the throw, so the footprint is the perspective
 * projection of a floor rectangle: (1 - μ cos²θ) / (1 + μ cos²θ).
 */
export function floorKeystoneRatio(angleDeg: number) {
  const angle = clampAngle(angleDeg);
  const cos = Math.cos((angle * Math.PI) / 180);
  const cover = FLOOR_THROW * cos * cos;
  return (1 - cover) / (1 + cover);
}

/** Apply a row-major 3×3 and perspective-divide. */
export function applyHomography(matrix: readonly number[], x: number, y: number): readonly [number, number] {
  const X = matrix[0] * x + matrix[1] * y + matrix[2];
  const Y = matrix[3] * x + matrix[4] * y + matrix[5];
  const W = matrix[6] * x + matrix[7] * y + matrix[8];
  return [X / W, Y / W];
}

/** Inverse of a row-major 3×3. Returns the input when it is singular. */
export function invertHomography(matrix: readonly number[]): HomographyMatrix {
  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];
  const d = matrix[3];
  const e = matrix[4];
  const f = matrix[5];
  const g = matrix[6];
  const h = matrix[7];
  const i = matrix[8];
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const D = c * h - b * i;
  const E = a * i - c * g;
  const F = b * g - a * h;
  const G = b * f - c * e;
  const H = c * d - a * f;
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return IDENTITY;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

/**
 * One keystone for the current surface and projector angle.
 * `cssSize` is the edge of the unrotated square. The viewport only scales that
 * whole projection down so the square stays on stage. Rotation is not an input.
 */
export function keystoneFor(
  surface: "floor" | "wall",
  angleDeg: number,
  cssSize: number,
  viewportWidth: number,
  viewportHeight: number,
): Keystone {
  const center = "translate(-50%, -50%)";
  if (!(cssSize > 0)) return { matrix: IDENTITY, css: center };
  const angle = clampAngle(angleDeg);
  if (surface === "wall") {
    const tilt = (angle / PROJECTOR_MAX) * FULL_TILT_DEGREES;
    if (tilt < 0.05) return { matrix: IDENTITY, css: center };
    return perspectiveKeystone(cssSize, tilt, Math.max(cssSize * 0.7, 1), viewportWidth, viewportHeight);
  }
  const ratio = floorKeystoneRatio(angle);
  if (ratio > 0.999) return { matrix: IDENTITY, css: center };
  const k = (1 - ratio) / (1 + ratio);
  const tilt = Math.min(32, (1 - ratio) * 58);
  const rad = (tilt * Math.PI) / 180;
  const sin = Math.sin(rad);
  if (tilt < 0.05 || !(sin > 1e-4) || !(k > 1e-4)) return { matrix: IDENTITY, css: center };
  const distance = Math.max(1, ((cssSize / 2) * sin) / k);
  return perspectiveKeystone(cssSize, tilt, distance, viewportWidth, viewportHeight);
}

function perspectiveKeystone(
  cssSize: number,
  tiltDeg: number,
  distance: number,
  viewportWidth: number,
  viewportHeight: number,
): Keystone {
  const tilt = round6(tiltDeg);
  const rad = (tilt * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const dist = round6(Math.max(distance, 1));
  const half = cssSize / 2;
  const projectAt = (x: number, y: number, fit: number) => {
    const w = dist - sin * y;
    return [(fit * dist * x) / w, (fit * cos * dist * y) / w] as const;
  };
  const fit = round6(fitSquare(half, (x, y) => projectAt(x, y, 1), viewportWidth, viewportHeight));
  const matrix: HomographyMatrix = [fit * dist, 0, 0, 0, fit * cos * dist, 0, 0, -sin, dist];
  const perspectivePx = fit === 1 ? dist : fit * dist;
  const scale = fit === 1 ? "" : ` scale(${fit})`;
  return {
    matrix,
    css: `translate(-50%, -50%) perspective(${perspectivePx}px) rotateX(${tilt}deg)${scale}`,
  };
}

function fitSquare(
  half: number,
  project: (x: number, y: number) => readonly [number, number],
  viewportWidth: number,
  viewportHeight: number,
) {
  const limitX = Math.max(1, viewportWidth / 2 - FIT_MARGIN_PX);
  const limitY = Math.max(1, viewportHeight / 2 - FIT_MARGIN_PX);
  const corners: readonly (readonly [number, number])[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  let fit = 1;
  for (const [x, y] of corners) {
    const [px, py] = project(x, y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return 1;
    fit = Math.min(fit, limitX / Math.max(Math.abs(px), 1e-4), limitY / Math.max(Math.abs(py), 1e-4));
  }
  if (!Number.isFinite(fit) || fit <= 0) return 1;
  return Math.min(1, fit);
}

function clampAngle(angleDeg: number) {
  return Number.isFinite(angleDeg) ? Math.min(PROJECTOR_MAX, Math.max(PROJECTOR_MIN, angleDeg)) : 0;
}

function round6(value: number) {
  return Math.round(value * 1e6) / 1e6;
}
