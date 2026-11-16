/**
 * Side view of the room, in the diagram's viewBox pixels.
 * The wall is the left face and the floor is the bottom face. They meet at the corner.
 * Distance 0 is on the wall and 1 is the far side. Height 0 is on the floor and 1 is the ceiling.
 * The aim is a spot on the floor, in that same 0–1 distance.
 *
 * The stored projector angle is the beam's angle above the floor, in whole degrees:
 *   atan2(height × room height, |distance − aim| × room width)
 * 90° is straight down onto the spot (no skew). A lower angle is a shallower beam and a
 * stronger floor keystone. Moving the projector keeps the spot and changes the angle.
 * The slider and the floor-spot drag move the spot so the beam matches the angle.
 */
export const ROOM = {
  viewW: 300,
  viewH: 196,
  wallFace: 36,
  floorFace: 172,
  roomTop: 28,
  roomRight: 290,
  width: 254,
  height: 144,
} as const;

export const DISTANCE_MIN = 0.1;
export const DISTANCE_MAX = 0.86;
export const HEIGHT_MIN = 0.14;
export const HEIGHT_MAX = 0.84;
export const AIM_MIN = 0.04;
export const AIM_MAX = 0.96;

export const DEFAULT_DISTANCE = 0.7;
export const DEFAULT_HEIGHT = 0.66;
export const DEFAULT_AIM = 0.18;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function clampDistance(value: number) {
  return round3(clamp(value, DISTANCE_MIN, DISTANCE_MAX));
}

export function clampHeight(value: number) {
  return round3(clamp(value, HEIGHT_MIN, HEIGHT_MAX));
}

export function clampAim(value: number) {
  return round3(clamp(value, AIM_MIN, AIM_MAX));
}

/** Step the spot until the rounded angle matches, so the slider and the picture agree. */
function nudgeAim(distance: number, height: number, wanted: number, seed: number) {
  let aim = round3(clamp(seed, AIM_MIN, AIM_MAX));
  for (let step = 0; step < 40; step += 1) {
    const angle = angleFromPlacement(distance, height, aim);
    if (angle === wanted) return { aim, angle };
    const towardProjector = distance > aim ? 1 : -1;
    const delta = (angle > wanted ? -towardProjector : towardProjector) * 0.002;
    const next = round3(aim + delta);
    if (next < AIM_MIN || next > AIM_MAX || next === aim) return { aim, angle };
    aim = next;
  }
  return { aim, angle: angleFromPlacement(distance, height, aim) };
}

/** Whole-degree floor angle of the beam from `distance`/`height` down to `aim`. */
export function angleFromPlacement(distance: number, height: number, aim: number) {
  const run = Math.abs(distance - aim) * ROOM.width;
  const drop = Math.max(height, 0) * ROOM.height;
  if (!(drop > 0)) return 0;
  const degrees = (Math.atan2(drop, run) * 180) / Math.PI;
  if (!Number.isFinite(degrees)) return 90;
  return Math.round(clamp(degrees, 0, 90));
}

export const DEFAULT_PROJECTOR_ANGLE = angleFromPlacement(
  DEFAULT_DISTANCE,
  DEFAULT_HEIGHT,
  DEFAULT_AIM,
);

/**
 * Move the floor spot so the beam from this projector matches `angle` as closely as the
 * room allows. Keeps the spot on its current side of the projector when that fits.
 */
export function aimForAngle(distance: number, height: number, angle: number, currentAim: number) {
  const wanted = clamp(Math.round(angle), 0, 90);
  const from = clampDistance(distance);
  const up = clampHeight(height);
  if (wanted >= 90) {
    const aim = clampAim(from);
    return { aim, angle: angleFromPlacement(from, up, aim) };
  }
  const drop = up * ROOM.height;
  const runNorm = drop / Math.tan((wanted * Math.PI) / 180) / ROOM.width;
  const towardWall = currentAim <= from;
  const primary = towardWall ? from - runNorm : from + runNorm;
  const secondary = towardWall ? from + runNorm : from - runNorm;
  const fits = (value: number) => value >= AIM_MIN && value <= AIM_MAX;
  if (fits(primary)) return nudgeAim(from, up, wanted, primary);
  if (fits(secondary)) return nudgeAim(from, up, wanted, secondary);
  const edges = [AIM_MIN, AIM_MAX];
  let aim = AIM_MIN;
  let best = Infinity;
  for (const edge of edges) {
    const next = angleFromPlacement(from, up, edge);
    const diff = Math.abs(next - wanted);
    if (diff < best) {
      aim = edge;
      best = diff;
    }
  }
  return { aim, angle: angleFromPlacement(from, up, aim) };
}

/**
 * A projector pose whose beam angle is the saved angle, for settings that have no position yet.
 * The spot stays toward the wall when the room is deep enough.
 */
export function placementForAngle(angleDeg: number) {
  const wanted = clamp(Math.round(Number.isFinite(angleDeg) ? angleDeg : 0), 0, 90);
  const height = wanted >= 75 ? 0.72 : DEFAULT_HEIGHT;
  let best = {
    distance: DEFAULT_DISTANCE,
    height,
    aim: DEFAULT_AIM,
    angle: angleFromPlacement(DEFAULT_DISTANCE, height, DEFAULT_AIM),
  };
  let bestDiff = Math.abs(best.angle - wanted);
  for (let step = 0; step <= 48; step += 1) {
    const distance = round3(DISTANCE_MAX - (step / 48) * (DISTANCE_MAX - DISTANCE_MIN));
    const solved = aimForAngle(distance, height, wanted, AIM_MIN);
    const diff = Math.abs(solved.angle - wanted);
    if (diff < bestDiff) {
      best = { distance, height, aim: solved.aim, angle: solved.angle };
      bestDiff = diff;
      if (diff === 0) return best;
    }
  }
  for (let step = 0; step <= 40; step += 1) {
    const nextHeight = round3(height - (step / 40) * (height - HEIGHT_MIN));
    const solved = aimForAngle(DISTANCE_MAX, nextHeight, wanted, AIM_MIN);
    const diff = Math.abs(solved.angle - wanted);
    if (diff < bestDiff) {
      best = { distance: DISTANCE_MAX, height: nextHeight, aim: solved.aim, angle: solved.angle };
      bestDiff = diff;
      if (diff === 0) return best;
    }
  }
  return best;
}
