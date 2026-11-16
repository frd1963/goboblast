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

/** How finely the viewport clamp samples one full turn. The clamp itself does not depend on the current angle. */
const TURN_SAMPLE_DEGREES = 15;

/**
 * Upright ink box, in CSS pixels. Rotation spins this rigid rectangle.
 * `centerX` and `centerY` are the ink center relative to the rotation center at 0°.
 */
export type GoboMark = {
  width: number;
  height: number;
  rotation: number;
  centerX?: number;
  centerY?: number;
  /** Ink extremes relative to the ink center at 0°, in CSS pixels. */
  outline?: readonly (readonly [number, number])[];
};

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
 * Corners of the upright ink box after a clockwise spin.
 * Floor keystone crops to the ink center, so the box stays centered there.
 * Wall keystone spins around the bitmap center, so the upright bearing is included.
 */
function markCorners(mark: GoboMark, rotationDeg: number, aroundBitmapCenter: boolean) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = aroundBitmapCenter ? (mark.centerX ?? 0) : 0;
  const oy = aroundBitmapCenter ? (mark.centerY ?? 0) : 0;
  const locals =
    mark.outline && mark.outline.length >= 2
      ? mark.outline
      : ([
          [-mark.width / 2, -mark.height / 2],
          [mark.width / 2, -mark.height / 2],
          [mark.width / 2, mark.height / 2],
          [-mark.width / 2, mark.height / 2],
        ] as const);
  return locals.map(([x, y]) => {
    const px = ox + x;
    const py = oy + y;
    return [px * cos - py * sin, px * sin + py * cos] as const;
  });
}

/** Project crop-local points through the floor keystone. `cssHeight` is the crop's on-screen height before this transform. */
export function floorProjectLocals(
  angleDeg: number,
  cssHeight: number,
  points: readonly (readonly [number, number])[],
  fit: number,
) {
  const ratio = floorKeystoneRatio(angleDeg);
  if (!(cssHeight > 0) || !(fit > 0) || ratio > 0.985) {
    return points.map(([x, y]) => [x * fit, y * fit] as const);
  }
  const k = (1 - ratio) / (1 + ratio);
  const tilt = Math.min(32, (1 - ratio) * 58);
  const rad = (tilt * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const distance = Math.max(1, ((cssHeight / 2) * sin) / Math.max(k, 0.0001));
  return points.map(([x, y]) => {
    const z = y * fit * sin;
    const scale = (distance * fit) / (distance * fit - z);
    return [x * fit * scale, y * fit * cos * scale] as const;
  });
}

/**
 * Scale that makes every sampled crop the same projected size as the upright one,
 * then one shrink so the largest sample still sits on the stage.
 */
export function floorSteadyScale(
  angleDeg: number,
  samples: readonly { cssHeight: number; points: readonly (readonly [number, number])[] }[],
  viewportWidth: number,
  viewportHeight: number,
) {
  const upright = samples[0];
  if (!upright || upright.points.length < 2) return { refSpan: 0, shrink: 1 };
  const spanOf = (sample: (typeof samples)[number], fit: number) =>
    pointSpan(floorProjectLocals(angleDeg, sample.cssHeight, sample.points, fit));
  const refSpan = spanOf(upright, 1);
  if (!(refSpan > 0)) return { refSpan: 0, shrink: 1 };
  const limitX = Math.max(1, viewportWidth / 2 - FIT_MARGIN_PX);
  const limitY = Math.max(1, viewportHeight / 2 - FIT_MARGIN_PX);
  let shrink = 1;
  for (const sample of samples) {
    const unit = spanOf(sample, 1);
    if (!(unit > 0)) continue;
    const fit = refSpan / unit;
    for (const [x, y] of floorProjectLocals(angleDeg, sample.cssHeight, sample.points, fit)) {
      shrink = Math.min(shrink, limitX / Math.max(Math.abs(x), 1e-4), limitY / Math.max(Math.abs(y), 1e-4));
    }
  }
  if (!Number.isFinite(shrink) || shrink <= 0) shrink = 1;
  return { refSpan, shrink: Math.min(1, shrink) };
}

function pointSpan(points: readonly (readonly [number, number])[]) {
  let span = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      span = Math.max(span, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
    }
  }
  return span;
}

function aabbHeight(width: number, height: number, rotationDeg: number) {
  const rad = (rotationDeg * Math.PI) / 180;
  return width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad));
}

/**
 * One scale for the whole turn. It matches every angle to the upright mark's
 * projected span, then shrinks just enough that the largest angle still fits.
 * The shrink does not depend on the angle being drawn.
 */
function uniformTurnScale(
  mark: GoboMark,
  project: (rotation: number, fit: number) => readonly (readonly [number, number])[],
  limitX: number,
  limitY: number,
) {
  const spanAt = (rotation: number) => pointSpan(project(rotation, 1));
  const upright = spanAt(0);
  if (!(upright > 0)) return 1;
  let shrink = 1;
  for (let rotation = 0; rotation < 360; rotation += TURN_SAMPLE_DEGREES) {
    const unit = spanAt(rotation);
    if (!(unit > 0)) continue;
    const fit = upright / unit;
    for (const [x, y] of project(rotation, fit)) {
      shrink = Math.min(shrink, limitX / Math.max(Math.abs(x), 1e-4), limitY / Math.max(Math.abs(y), 1e-4));
    }
  }
  if (!Number.isFinite(shrink) || shrink <= 0) shrink = 1;
  shrink = Math.min(1, shrink);
  const current = spanAt(mark.rotation);
  const normalize = current > 0 ? upright / current : 1;
  return normalize * shrink;
}

/**
 * Perspective transform for a floor gobo that has already been cropped to its ink.
 * 90° is square. Lower angles tip the beam so the top (far) edge narrows and the
 * bottom (near) edge widens by the throw ratio. The crop is what makes the letters
 * themselves keystone.
 * The uniform scale keeps that tapered mark the same size at every rotation.
 */
export function floorThrowTransform(
  angleDeg: number,
  cssWidth: number,
  cssHeight: number,
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
  mark?: GoboMark,
  scale?: number,
) {
  const center = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
  const ratio = floorKeystoneRatio(angleDeg);
  if (cssWidth <= 0 || cssHeight <= 0 || ratio > 0.985) return center;
  const k = (1 - ratio) / (1 + ratio);
  const tilt = Math.min(32, (1 - ratio) * 58);
  const rad = (tilt * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const limitX = Math.max(1, viewportWidth / 2 - FIT_MARGIN_PX);
  const limitY = Math.max(1, viewportHeight / 2 - FIT_MARGIN_PX);
  const steady = typeof scale === "number" && Number.isFinite(scale) && scale > 0;
  const usable =
    !steady &&
    mark !== undefined &&
    Number.isFinite(mark.width) &&
    Number.isFinite(mark.height) &&
    mark.width > 1 &&
    mark.height > 1 &&
    Number.isFinite(mark.rotation);

  const heightFor = (rotation: number) =>
    usable ? Math.max(1, aabbHeight(mark.width, mark.height, rotation)) : cssHeight;
  const distanceFor = (height: number) => Math.max(1, ((height / 2) * sin) / Math.max(k, 0.0001));
  const projectPoints = (rotation: number, fit: number, points: readonly (readonly [number, number])[]) => {
    const distance = distanceFor(heightFor(rotation));
    return points.map(([x, y]) => {
      const z = y * fit * sin;
      const scale = (distance * fit) / (distance * fit - z);
      return [x * fit * scale, y * fit * cos * scale] as const;
    });
  };

  let fit = steady ? scale : 1;
  if (!steady && usable) {
    fit = uniformTurnScale(
      mark,
      (rotation, sampleFit) => projectPoints(rotation, sampleFit, markCorners(mark, rotation, false)),
      limitX,
      limitY,
    );
  } else if (!steady) {
    const distance = distanceFor(cssHeight);
    const project = (x: number, y: number, sampleFit: number) => {
      const z = y * sampleFit * sin;
      const scale = (distance * sampleFit) / (distance * sampleFit - z);
      return [x * sampleFit * scale, y * sampleFit * cos * scale] as const;
    };
    const corners = [
      [-cssWidth / 2, -cssHeight / 2],
      [cssWidth / 2, -cssHeight / 2],
      [-cssWidth / 2, cssHeight / 2],
      [cssWidth / 2, cssHeight / 2],
    ];
    for (const [x, y] of corners) {
      const [px, py] = project(x, y, 1);
      fit = Math.min(
        fit,
        limitX / (Math.abs(px) + Math.abs(offsetX)),
        limitY / (Math.abs(py) + Math.abs(offsetY)),
      );
    }
    if (!Number.isFinite(fit) || fit <= 0) fit = 1;
    fit = Math.min(1, fit);
  }

  const distance = distanceFor(usable ? heightFor(mark.rotation) : cssHeight);
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
  mark?: GoboMark,
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
  const viewportFit = Math.min(1, limit / (half + foreshorten * limit));
  const base = Number.isFinite(viewportFit) && viewportFit > 0 ? viewportFit : 1;
  const usable =
    mark !== undefined &&
    Number.isFinite(mark.width) &&
    Number.isFinite(mark.height) &&
    mark.width > 1 &&
    mark.height > 1 &&
    Number.isFinite(mark.rotation);
  let turn = 1;
  if (usable) {
    const project = (rotation: number, fit: number) => {
      const scale = base * fit;
      return markCorners(mark, rotation, true).map(([x, y]) => {
        const z = y * scale * sin;
        const persp = (distance * fit) / (distance * fit - z);
        return [x * scale * persp, y * scale * cos * persp] as const;
      });
    };
    turn = uniformTurnScale(mark, project, maxX, maxY);
  }
  const scale = base * turn;
  return `translate(-50%, -50%) perspective(${distance * turn}px) rotateX(${tilt}deg) scale(${scale})`;
}
