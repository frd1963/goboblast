export type Rgb = { r: number; g: number; b: number };

export type KeyParams = {
  lumaKey: boolean;
  /** 0–1. Pixels on the keyed side of this luminance drop out. */
  lumaThreshold: number;
  /** 0–1. Width of the ramp around the threshold. */
  lumaSoftness: number;
  /** When set, light pixels drop out instead of dark ones. */
  lumaInvert: boolean;
  chromaKey: boolean;
  chroma: Rgb;
  /** 0–1. Distance from the key color, in channel units, that still drops out. */
  chromaTolerance: number;
  /** 0–1. Extra distance over which the key fades. */
  chromaSoftness: number;
  /** 0–1. How hard to pull the key color out of the pixels that remain. */
  chromaSpill: number;
  tint: boolean;
  tintColor: Rgb;
};

const HEX = /^#?([0-9a-fA-F]{6})$/;

export function parseHex(color: string): Rgb {
  const match = HEX.exec(color.trim());
  const hex = match?.[1] ?? "f8fafc";
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

export function rgbToHex(r: number, g: number, b: number) {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function smooth(edge0: number, edge1: number, value: number) {
  if (!(edge1 > edge0)) return value >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Knock out pixels in place. Keyed pixels become transparent so the black stage
 * shows through. Spill pulls the key color off the fringe that stays.
 */
export function keyPixels(data: Uint8ClampedArray, params: KeyParams) {
  const lumaSoft = Math.max(0, params.lumaSoftness);
  const chromaSoft = Math.max(0, params.chromaSoftness);
  const { r: kr, g: kg, b: kb } = params.chroma;
  const keyLen2 = kr * kr + kg * kg + kb * kb || 1;
  const { r: tr, g: tg, b: tb } = params.tintColor;

  for (let index = 0; index < data.length; index += 4) {
    let r = data[index] / 255;
    let g = data[index + 1] / 255;
    let b = data[index + 2] / 255;
    let alpha = data[index + 3] / 255;

    if (params.lumaKey) {
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const keep = params.lumaInvert
        ? 1 - smooth(params.lumaThreshold - lumaSoft, params.lumaThreshold, luminance)
        : smooth(params.lumaThreshold, params.lumaThreshold + lumaSoft, luminance);
      alpha *= keep;
    }

    if (params.chromaKey) {
      const distance = Math.hypot(r - kr, g - kg, b - kb);
      const keep = smooth(params.chromaTolerance, params.chromaTolerance + chromaSoft, distance);
      if (params.chromaSpill > 0) {
        const along = (r * kr + g * kg + b * kb) / keyLen2;
        if (along > 0) {
          const closeness = 1 - smooth(params.chromaTolerance, params.chromaTolerance + chromaSoft + 0.45, distance);
          const amount = params.chromaSpill * closeness;
          r = Math.max(0, r - kr * along * amount);
          g = Math.max(0, g - kg * along * amount);
          b = Math.max(0, b - kb * along * amount);
        }
      }
      alpha *= keep;
    }

    if (params.tint) {
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = tr * luminance;
      g = tg * luminance;
      b = tb * luminance;
    }

    data[index] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    data[index + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    data[index + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
    data[index + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  }
}
