import { getFont } from "@/lib/fonts";
import {
  DEFAULT_AIM,
  DEFAULT_DISTANCE,
  DEFAULT_HEIGHT,
  DEFAULT_PROJECTOR_ANGLE,
  AIM_MAX,
  AIM_MIN,
  DISTANCE_MAX,
  DISTANCE_MIN,
  HEIGHT_MAX,
  HEIGHT_MIN,
  angleFromPlacement,
  angleFromSpot,
  placementForAngle,
  type BeamSpot,
} from "@/lib/placement";

export const STORAGE_KEY = "goboblast-settings";

/** Panel closes after this much quiet time. */
export const HIDE_AFTER_MS = 4000;

/** Stored angle wraps into this range. 0 is upright. Positive is clockwise. */
export const ROTATION_MIN = -180;
export const ROTATION_MAX = 180;

/** Speed slider ends, in degrees per second. Center is stopped. */
export const SPIN_STEP = 15;
export const SPIN_MIN = -180;
export const SPIN_MAX = 180;

export type TextAlign = "left" | "center" | "right";
export type ProjectionSurface = "floor" | "wall";
export type GoboSource = "text" | "image";

export type GoboSettings = {
  text: string;
  color: string;
  size: number;
  font: string;
  outline: boolean;
  outlineWidth: number;
  outlineColor: string;
  letterSpacing: number;
  lineHeight: number;
  align: TextAlign;
  glow: number;
  /** Degrees the gobo has reached. 0 is upright. Positive is clockwise. */
  rotation: number;
  /** Degrees per second. The slider sets this directly. Positive is clockwise. */
  spin: number;
  /**
   * Beam angle in degrees, 0 to 90, above the floor.
   * 90° is straight down. Lower angles are shallower. Derived from the projector
   * position and the spot, which is on the floor or, when the beam reaches the wall
   * first, on the wall.
   */
  projectorAngle: number;
  /** 0 is against the wall, 1 is the far side of the room. */
  projectorDistance: number;
  /** 0 is on the floor, 1 is at the ceiling. */
  projectorHeight: number;
  /** Floor spot, in the same 0–1 distance as the projector. Unused while the spot is on the wall. */
  projectorAim: number;
  /** Surface the beam is hitting. */
  projectorSpot: BeamSpot["surface"];
  /** Height of a wall spot. 0 is the corner, 1 is the ceiling. */
  projectorSpotHeight: number;
  /** Always floor. Older saves that stored wall are migrated on load. */
  surface: ProjectionSurface;
  /** Text draws the words. Image projects an uploaded picture. */
  source: GoboSource;
  /** File name of the picture kept in IndexedDB. Empty when none is stored. */
  imageName: string;
  lumaKey: boolean;
  /** 0–100. Dark pixels below this drop out, unless invert is on. */
  lumaThreshold: number;
  /** 0–100. Width of the fade at the threshold. */
  lumaSoftness: number;
  /** Knock out light pixels instead of dark ones. */
  lumaInvert: boolean;
  chromaKey: boolean;
  chromaColor: string;
  /** 0–100. How far a color can be from the key and still drop out. */
  chromaTolerance: number;
  /** 0–100. Width of the fade at the edge of the key. */
  chromaSoftness: number;
  /** 0–100. Pulls the key color out of the pixels that remain. */
  chromaSpill: number;
  /** Recolor the picture with the Color setting. */
  imageTint: boolean;
};

export const defaultSettings: GoboSettings = {
  text: "GoboBlast",
  color: "#f8fafc",
  size: 16,
  font: "system",
  outline: false,
  outlineWidth: 2,
  outlineColor: "#000000",
  letterSpacing: 0.02,
  lineHeight: 1.05,
  align: "center",
  glow: 0,
  rotation: 0,
  spin: 0,
  projectorAngle: DEFAULT_PROJECTOR_ANGLE,
  projectorDistance: DEFAULT_DISTANCE,
  projectorHeight: DEFAULT_HEIGHT,
  projectorAim: DEFAULT_AIM,
  projectorSpot: "floor",
  projectorSpotHeight: 0,
  surface: "floor",
  source: "text",
  imageName: "",
  lumaKey: false,
  lumaThreshold: 12,
  lumaSoftness: 10,
  lumaInvert: false,
  chromaKey: false,
  chromaColor: "#00ff00",
  chromaTolerance: 32,
  chromaSoftness: 12,
  chromaSpill: 40,
  imageTint: false,
};

/** Wrap any angle into the slider range. +180 stays on the clockwise end. */
export function normalizeAngle(degrees: number) {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = (((degrees + 180) % 360) + 360) % 360 - 180;
  if (wrapped <= -180 + 1e-6 && degrees > 0) return 180;
  return wrapped;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function sanitizeSettings(input: unknown): GoboSettings {
  const raw = input && typeof input === "object" ? (input as Partial<GoboSettings>) : {};
  const align: TextAlign =
    raw.align === "left" || raw.align === "right" || raw.align === "center"
      ? raw.align
      : defaultSettings.align;

  return {
    text: typeof raw.text === "string" ? raw.text.slice(0, 400) : defaultSettings.text,
    color:
      typeof raw.color === "string" && HEX.test(raw.color)
        ? raw.color.toLowerCase()
        : defaultSettings.color,
    size: round(clamp(raw.size, 2, 80, defaultSettings.size), 0),
    font: getFont(typeof raw.font === "string" ? raw.font : defaultSettings.font).value,
    outline: typeof raw.outline === "boolean" ? raw.outline : defaultSettings.outline,
    outlineWidth: round(clamp(raw.outlineWidth, 1, 16, defaultSettings.outlineWidth), 0),
    outlineColor:
      typeof raw.outlineColor === "string" && HEX.test(raw.outlineColor)
        ? raw.outlineColor.toLowerCase()
        : defaultSettings.outlineColor,
    letterSpacing: round(
      clamp(raw.letterSpacing, -0.08, 0.5, defaultSettings.letterSpacing),
      2,
    ),
    lineHeight: round(clamp(raw.lineHeight, 0.8, 2, defaultSettings.lineHeight), 2),
    align,
    glow: round(clamp(raw.glow, 0, 100, defaultSettings.glow), 0),
    rotation: round(
      normalizeAngle(clamp(raw.rotation, -100000, 100000, defaultSettings.rotation)),
      1,
    ),
    spin: round(clamp(raw.spin, SPIN_MIN, SPIN_MAX, defaultSettings.spin), 1),
    ...readPlacement(raw),
    surface: "floor",
    source: raw.source === "image" ? "image" : "text",
    imageName: typeof raw.imageName === "string" ? raw.imageName.slice(0, 180) : "",
    lumaKey: raw.lumaKey === true,
    lumaThreshold: round(clamp(raw.lumaThreshold, 0, 100, defaultSettings.lumaThreshold), 0),
    lumaSoftness: round(clamp(raw.lumaSoftness, 0, 100, defaultSettings.lumaSoftness), 0),
    lumaInvert: raw.lumaInvert === true,
    chromaKey: raw.chromaKey === true,
    chromaColor:
      typeof raw.chromaColor === "string" && HEX.test(raw.chromaColor)
        ? raw.chromaColor.toLowerCase()
        : defaultSettings.chromaColor,
    chromaTolerance: round(clamp(raw.chromaTolerance, 0, 100, defaultSettings.chromaTolerance), 0),
    chromaSoftness: round(clamp(raw.chromaSoftness, 0, 100, defaultSettings.chromaSoftness), 0),
    chromaSpill: round(clamp(raw.chromaSpill, 0, 100, defaultSettings.chromaSpill), 0),
    imageTint: raw.imageTint === true,
  };
}

function readPlacement(raw: Partial<GoboSettings>) {
  const distance = finite(raw.projectorDistance);
  const height = finite(raw.projectorHeight);
  const aim = finite(raw.projectorAim);
  if (distance === null || height === null || aim === null) {
    const saved = finite(raw.projectorAngle);
    const placed = placementForAngle(saved === null ? defaultSettings.projectorAngle : saved);
    return {
      projectorDistance: placed.distance,
      projectorHeight: placed.height,
      projectorAim: placed.aim,
      projectorSpot: "floor" as const,
      projectorSpotHeight: 0,
      projectorAngle: placed.angle,
    };
  }
  const projectorDistance = round(clamp(distance, DISTANCE_MIN, DISTANCE_MAX, defaultSettings.projectorDistance), 3);
  const projectorHeight = round(clamp(height, HEIGHT_MIN, HEIGHT_MAX, defaultSettings.projectorHeight), 3);
  if (raw.projectorSpot === "wall") {
    const projectorSpotHeight = round(
      clamp(finite(raw.projectorSpotHeight) ?? 0, 0, projectorHeight, 0),
      3,
    );
    return {
      projectorDistance,
      projectorHeight,
      projectorAim: 0,
      projectorSpot: "wall" as const,
      projectorSpotHeight,
      projectorAngle: angleFromSpot(projectorDistance, projectorHeight, {
        surface: "wall",
        height: projectorSpotHeight,
      }),
    };
  }
  const projectorAim = round(clamp(aim, AIM_MIN, AIM_MAX, defaultSettings.projectorAim), 3);
  return {
    projectorDistance,
    projectorHeight,
    projectorAim,
    projectorSpot: "floor" as const,
    projectorSpotHeight: 0,
    projectorAngle: angleFromPlacement(projectorDistance, projectorHeight, projectorAim),
  };
}

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function loadSettings(): GoboSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: GoboSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    // Private mode and full storage should not take down the projector.
  }
}

export function hasVisibleText(text: string) {
  return text.trim().length > 0;
}
