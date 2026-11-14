/**
 * Pitch of the projector away from the surface normal, in degrees.
 * 0 aims straight at the surface: a horizontal beam onto a vertical surface.
 * Positive pitches the projector up. Negative pitches it down.
 */
export const PROJECTOR_MIN = -60;
export const PROJECTOR_MAX = 60;

const FIT_MARGIN_PX = 28;

/**
 * Inverse keystone for a projector pitched by `angleDeg`.
 * The gobo is tilted about its center and scaled so the whole mark stays on stage.
 * Zero degrees is only the centering translation.
 */
export function projectorTransform(
  angleDeg: number,
  cssSize: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  if (!Number.isFinite(angleDeg) || Math.abs(angleDeg) < 0.05 || cssSize <= 0) {
    return "translate(-50%, -50%)";
  }
  const rad = (angleDeg * Math.PI) / 180;
  const distance = Math.max(viewportWidth, viewportHeight, 1);
  const half = cssSize / 2;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const maxX = Math.max(1, viewportWidth / 2 - FIT_MARGIN_PX);
  const maxY = Math.max(1, viewportHeight / 2 - FIT_MARGIN_PX);
  const limit = Math.min(maxX, maxY / Math.max(cos, 0.05));
  const foreshorten = (half * sin) / distance;
  const fit = Math.min(1, limit / (half + foreshorten * limit));
  const scale = Number.isFinite(fit) && fit > 0 ? fit : 1;
  return `translate(-50%, -50%) perspective(${distance}px) rotateX(${angleDeg}deg) scale(${scale})`;
}
