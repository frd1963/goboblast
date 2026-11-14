import { getFont } from "@/lib/fonts";
import { PROJECTOR_MAX, PROJECTOR_MIN } from "@/lib/projector";

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
   * Beam depression toward the floor, in degrees.
   * 0 is a horizontal beam. 90 points straight down.
   */
  projectorAngle: number;
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
  projectorAngle: 0,
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
    projectorAngle: round(
      clamp(raw.projectorAngle, PROJECTOR_MIN, PROJECTOR_MAX, defaultSettings.projectorAngle),
      0,
    ),
  };
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
