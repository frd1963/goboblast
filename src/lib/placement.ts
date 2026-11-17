/**
 * Side view of the room, in the diagram's viewBox pixels.
 * The wall is the left face, the floor is the bottom face, and the ceiling is the top.
 * Distance 0 is on the wall and 1 is the far side. Height 0 is on the floor and 1 is the ceiling.
 *
 * The stored projector angle is the beam's angle from horizontal, in whole degrees, from −90 to 90.
 * 90° is straight down onto the floor. 0° is horizontal into the wall. Negative angles aim up:
 * a shallow one hits the wall above the projector, and a steep one hits the ceiling. −90° is
 * straight up. Downward, the same rule hits the floor, or the wall when the beam is too shallow.
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
export const AIM_MIN = 0;
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

export type BeamSpot =
  | { surface: "floor"; aim: number }
  | { surface: "ceiling"; aim: number }
  | { surface: "wall"; height: number };

/** Whole-degree signed angle of the beam. Positive is down, negative is up. */
export function angleFromSpot(distance: number, height: number, spot: BeamSpot) {
  if (spot.surface === "floor") return angleFromPlacement(distance, height, spot.aim);
  if (spot.surface === "ceiling") {
    const run = Math.abs(distance - spot.aim) * ROOM.width;
    const rise = Math.max(0, 1 - height) * ROOM.height;
    if (!(rise > 0)) return 0;
    if (!(run > 0.5)) return -90;
    const degrees = -((Math.atan2(rise, run) * 180) / Math.PI);
    if (!Number.isFinite(degrees)) return -90;
    return Math.round(clamp(degrees, -90, 0));
  }
  const run = Math.max(distance, 0) * ROOM.width;
  const drop = (height - spot.height) * ROOM.height;
  if (!(run > 0.5)) {
    if (drop > 1) return 90;
    if (drop < -1) return -90;
    return 0;
  }
  const degrees = (Math.atan2(drop, run) * 180) / Math.PI;
  if (!Number.isFinite(degrees)) return 0;
  return Math.round(clamp(degrees, -90, 90));
}

/** Raise or lower the wall spot until the rounded angle matches. */
function nudgeWall(distance: number, height: number, wanted: number, seed: number) {
  const low = wanted < 0 ? height : 0;
  const high = wanted < 0 ? 1 : height;
  let spotHeight = round3(clamp(seed, low, high));
  for (let step = 0; step < 50; step += 1) {
    const angle = angleFromSpot(distance, height, { surface: "wall", height: spotHeight });
    if (angle === wanted) return { spot: { surface: "wall" as const, height: spotHeight }, angle };
    const next = round3(spotHeight + (angle > wanted ? 0.002 : -0.002));
    if (next < low || next > high || next === spotHeight) {
      return { spot: { surface: "wall" as const, height: spotHeight }, angle };
    }
    spotHeight = next;
  }
  return {
    spot: { surface: "wall" as const, height: spotHeight },
    angle: angleFromSpot(distance, height, { surface: "wall", height: spotHeight }),
  };
}

/** Step a ceiling spot until the rounded upward angle matches. */
function nudgeCeiling(distance: number, height: number, wanted: number, seed: number) {
  let aim = round3(clamp(seed, AIM_MIN, AIM_MAX));
  for (let step = 0; step < 40; step += 1) {
    const angle = angleFromSpot(distance, height, { surface: "ceiling", aim });
    if (angle === wanted) return { aim, angle };
    const towardProjector = distance > aim ? 1 : -1;
    const delta = (angle < wanted ? -towardProjector : towardProjector) * 0.002;
    const next = round3(aim + delta);
    if (next < AIM_MIN || next > AIM_MAX || next === aim) return { aim, angle };
    aim = next;
  }
  return { aim, angle: angleFromSpot(distance, height, { surface: "ceiling", aim }) };
}

/**
 * Place the spot so the beam matches `angle`. Toward the wall, a beam that would
 * cross the wall face before the floor or the ceiling lands on the wall. The other
 * way, it stays on the floor (down) or the ceiling (up).
 */
export function spotForAngle(distance: number, height: number, angle: number, towardWall: boolean) {
  const wanted = clamp(Math.round(angle), -90, 90);
  const from = clampDistance(distance);
  const up = clampHeight(height);
  if (wanted <= -90) {
    const aim = clampAim(from);
    return { spot: { surface: "ceiling" as const, aim }, angle: angleFromSpot(from, up, { surface: "ceiling", aim }) };
  }
  if (wanted < 0) {
    if (!towardWall) {
      const ceiling = aimForCeiling(from, up, wanted, AIM_MAX);
      return { spot: { surface: "ceiling" as const, aim: ceiling.aim }, angle: ceiling.angle };
    }
    const magnitude = -wanted;
    const rise = (1 - up) * ROOM.height;
    const runNorm = rise / Math.tan((magnitude * Math.PI) / 180) / ROOM.width;
    const aim = from - runNorm;
    if (aim >= 0 && Number.isFinite(aim)) {
      const snapped = nudgeCeiling(from, up, wanted, aim);
      if (snapped.angle === wanted || aim > 0.02) {
        return { spot: { surface: "ceiling" as const, aim: snapped.aim }, angle: snapped.angle };
      }
    }
    const hitRise = from * ROOM.width * Math.tan((magnitude * Math.PI) / 180);
    const seed = up + hitRise / ROOM.height;
    return nudgeWall(from, up, wanted, seed);
  }
  if (wanted >= 90) {
    const aim = clampAim(from);
    return { spot: { surface: "floor" as const, aim }, angle: angleFromPlacement(from, up, aim) };
  }
  if (!towardWall) {
    const floor = aimForAngle(from, up, wanted, AIM_MAX);
    return { spot: { surface: "floor" as const, aim: floor.aim }, angle: floor.angle };
  }
  const drop = up * ROOM.height;
  const runNorm = drop / Math.tan((wanted * Math.PI) / 180) / ROOM.width;
  const aim = from - runNorm;
  if (aim >= 0) {
    const snapped = nudgeAim(from, up, wanted, aim);
    if (snapped.angle === wanted || aim > 0.02) {
      return { spot: { surface: "floor" as const, aim: snapped.aim }, angle: snapped.angle };
    }
  }
  const hitDrop = from * ROOM.width * Math.tan((wanted * Math.PI) / 180);
  const seed = (up * ROOM.height - hitDrop) / ROOM.height;
  return nudgeWall(from, up, wanted, seed);
}

/** Keep a dragged spot on the floor, the ceiling, or the wall between them. */
export function clampSpot(_height: number, spot: BeamSpot): BeamSpot {
  if (spot.surface === "floor" || spot.surface === "ceiling") {
    return { surface: spot.surface, aim: clampAim(spot.aim) };
  }
  return { surface: "wall", height: round3(clamp(spot.height, 0, 1)) };
}

export const DEFAULT_PROJECTOR_ANGLE = angleFromPlacement(
  DEFAULT_DISTANCE,
  DEFAULT_HEIGHT,
  DEFAULT_AIM,
);

/** Move the ceiling spot so an upward beam matches `angle` as closely as the room allows. */
export function aimForCeiling(distance: number, height: number, angle: number, currentAim: number) {
  const wanted = clamp(Math.round(angle), -90, -1);
  const from = clampDistance(distance);
  const up = clampHeight(height);
  const magnitude = -wanted;
  const rise = (1 - up) * ROOM.height;
  const runNorm = rise / Math.tan((magnitude * Math.PI) / 180) / ROOM.width;
  const towardWall = currentAim <= from;
  const primary = towardWall ? from - runNorm : from + runNorm;
  const secondary = towardWall ? from + runNorm : from - runNorm;
  const fits = (value: number) => value >= AIM_MIN && value <= AIM_MAX;
  if (Number.isFinite(primary) && fits(primary)) return nudgeCeiling(from, up, wanted, primary);
  if (Number.isFinite(secondary) && fits(secondary)) return nudgeCeiling(from, up, wanted, secondary);
  const edges = [AIM_MIN, AIM_MAX];
  let aim = AIM_MIN;
  let best = Infinity;
  for (const edge of edges) {
    const next = angleFromSpot(from, up, { surface: "ceiling", aim: edge });
    const diff = Math.abs(next - wanted);
    if (diff < best) {
      aim = edge;
      best = diff;
    }
  }
  return { aim, angle: angleFromSpot(from, up, { surface: "ceiling", aim }) };
}

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
  const wanted = clamp(Math.round(Number.isFinite(angleDeg) ? angleDeg : 0), -90, 90);
  if (wanted < 0) {
    const height = wanted <= -75 ? 0.4 : DEFAULT_HEIGHT;
    let bestDistance = DEFAULT_DISTANCE;
    let bestHeight = height;
    let best = spotForAngle(bestDistance, bestHeight, wanted, true);
    let bestDiff = Math.abs(best.angle - wanted);
    for (let step = 0; step <= 48; step += 1) {
      const distance = round3(DISTANCE_MAX - (step / 48) * (DISTANCE_MAX - DISTANCE_MIN));
      const solved = spotForAngle(distance, height, wanted, true);
      const diff = Math.abs(solved.angle - wanted);
      if (diff < bestDiff) {
        bestDistance = distance;
        best = solved;
        bestDiff = diff;
        if (diff === 0) break;
      }
    }
    const aim = best.spot.surface === "wall" ? 0 : best.spot.aim;
    return { distance: bestDistance, height: bestHeight, aim, angle: best.angle, spot: best.spot };
  }
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
