import {
  floorKeystoneRatio,
  surfaceStraightOn,
  type KeystoneTarget,
  type ProjectorThrow,
} from "@/lib/projector";

/** The top of the unkeystoned square is the edge farther from the projector. */
export function farEdgeIsTop(target: KeystoneTarget, angleDeg: number) {
  if (target === "floor") return true;
  if (target === "ceiling") return false;
  return angleDeg < 0;
}

/**
 * How much brighter the far edge becomes, as a fraction of each pixel's current value.
 * Strength 0 leaves the image alone. A beam that is straight on the surface has no
 * far edge, so it stays unchanged too. The near edge is never lifted.
 */
export function farBrightnessLift(ratio: number, amount: number) {
  const strength = Math.min(1, Math.max(0, amount / 100));
  const taper = 1 - Math.max(0, Math.min(1, ratio));
  if (!(strength > 0) || !(taper > 0.001)) return 0;
  return strength * taper;
}

export function evenBrightnessLift(
  target: KeystoneTarget,
  angleDeg: number,
  kind: ProjectorThrow,
  amount: number,
) {
  return farBrightnessLift(floorKeystoneRatio(surfaceStraightOn(target, angleDeg), kind), amount);
}

/**
 * Brighten toward the far edge. Black stays black, and transparent pixels stay
 * transparent, so the stage behind the gobo is not tinted.
 */
export function applyEvenBrightness(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  farIsTop: boolean,
  lift: number,
) {
  if (!(lift > 0) || height < 2 || width < 1) return;
  const span = height - 1;
  for (let y = 0; y < height; y += 1) {
    const across = farIsTop ? (span - y) / span : y / span;
    const gain = 1 + lift * across;
    if (gain <= 1.0005) continue;
    let index = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[index + 3];
      if (alpha !== 0) {
        data[index] = scaleChannel(data[index], gain);
        data[index + 1] = scaleChannel(data[index + 1], gain);
        data[index + 2] = scaleChannel(data[index + 2], gain);
      }
      index += 4;
    }
  }
}

function scaleChannel(value: number, gain: number) {
  if (value === 0) return 0;
  const next = Math.round(value * gain);
  return next > 255 ? 255 : next;
}
