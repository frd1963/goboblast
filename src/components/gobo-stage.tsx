"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FRAME_STEP_DEGREES, frameIndex, renderGoboFrames } from "@/lib/gobo-frames";
import {
  PROJECTOR_MAX,
  PROJECTOR_MIN,
  floorProjectLocals,
  floorSteadyScale,
  floorThrowTransform,
  projectorTransform,
  type GoboMark,
} from "@/lib/projector";
import { FONT_GROUPS, FONT_OPTIONS, getFont } from "@/lib/fonts";
import {
  HIDE_AFTER_MS,
  SPIN_MAX,
  SPIN_MIN,
  SPIN_STEP,
  type GoboSettings,
  type TextAlign,
  hasVisibleText,
  loadSettings,
  normalizeAngle,
  saveSettings,
} from "@/lib/settings";

const CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[role='slider']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='switch']",
  "[role='option']",
  "[data-slot='select-trigger']",
  "[data-slot='select-content']",
  "[data-slot='select-item']",
  "[data-slot='slider']",
  "[data-slot='slider-thumb']",
  "[data-slot='switch']",
  "[data-slot='button']",
].join(",");

const IGNORED_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Tab",
  "ContextMenu",
  "Dead",
  "Unidentified",
]);

const ALIGN_ITEMS = {
  left: "Left",
  center: "Center",
  right: "Right",
} as const;

function isControlFocused() {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return false;
  if (element === document.body || element === document.documentElement) return false;
  return element.matches(CONTROL_SELECTOR) || Boolean(element.closest(CONTROL_SELECTOR));
}

function sliderNumber(value: number | readonly number[]) {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

function formatDegrees(value: number) {
  return `${Math.round(value)}°`;
}

function formatSpeed(spin: number) {
  const rounded = Math.round(spin);
  return `${rounded}°/s`;
}

function angleCaption(rotation: number, spin: number) {
  const angle = formatDegrees(rotation);
  if (spin === 0) return `Holding ${angle}`;
  return angle;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen().catch(() => {});
    return;
  }
  void document.exitFullscreen().catch(() => {});
}

export function GoboStage() {
  const [settings, setSettings] = useState<GoboSettings>(() => loadSettings());
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const cssSizeRef = useRef(0);
  const shownFrameRef = useRef(-1);
  const angleRef = useRef(settings.rotation);
  const shownRef = useRef(Math.round(settings.rotation));
  const settingsRef = useRef(settings);
  const buildRef = useRef(0);
  const placementRef = useRef("");
  const floorBoxRef = useRef({ w: 0, h: 0, ox: 0, oy: 0 });
  const markRef = useRef<GoboMark>({ width: 0, height: 0, rotation: 0, centerX: 0, centerY: 0 });
  const inkCacheRef = useRef(
    new Map<number, { minX: number; maxX: number; minY: number; maxY: number; outline: readonly (readonly [number, number])[] }>(),
  );
  const floorFitRef = useRef<{ key: string; refSpan: number; shrink: number } | null>(null);

  const bindCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    shownFrameRef.current = -1;
  }, []);

  function paintFrame() {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || frames.length === 0) return;
    const index = frameIndex(angleRef.current);
    const surface = settingsRef.current.surface;
    const projector = settingsRef.current.projectorAngle;
    const warp = surface === "floor" && projector < PROJECTOR_MAX - 0.05;
    const stamp = warp ? `${surface}:${projector}` : "";
    if (index === shownFrameRef.current && canvas.dataset.warp === stamp) return;
    const bitmap = frames[index];
    if (!bitmap) return;
    const cssSize = cssSizeRef.current;
    if (warp) drawFloorKeystone(canvas, bitmap, index, cssSize);
    else drawSquare(canvas, bitmap, cssSize);
    shownFrameRef.current = index;
    canvas.dataset.warp = stamp;
    canvas.dataset.rotation = normalizeAngle(angleRef.current).toFixed(2);
    canvas.dataset.frame = String(index);
    markRef.current = { ...markRef.current, rotation: index * FRAME_STEP_DEGREES };
    applyPlacement();
  }

  function drawSquare(canvas: HTMLCanvasElement, bitmap: ImageBitmap, cssSize: number) {
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    floorBoxRef.current = { w: cssSize, h: cssSize, ox: 0, oy: 0 };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  }

  function inkOf(bitmap: ImageBitmap, index: number) {
    const cached = inkCacheRef.current.get(index);
    if (cached) return cached;
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    const empty = {
      minX: 0,
      maxX: bitmap.width - 1,
      minY: 0,
      maxY: bitmap.height - 1,
      outline: [] as readonly (readonly [number, number])[],
    };
    if (!ctx) return empty;
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, scratch.width, scratch.height);
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] <= 20) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) {
      inkCacheRef.current.set(index, empty);
      return empty;
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const bins = 32;
    const best: ({ x: number; y: number; r2: number } | undefined)[] = new Array(bins);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] <= 20) continue;
        const dx = x - centerX;
        const dy = y - centerY;
        const r2 = dx * dx + dy * dy;
        const bin = Math.round(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * (bins - 1)) % bins;
        const previous = best[bin];
        if (!previous || r2 > previous.r2) best[bin] = { x: dx, y: dy, r2 };
      }
    }
    const bounds = {
      minX,
      maxX,
      minY,
      maxY,
      outline: best
        .filter((point): point is { x: number; y: number; r2: number } => point !== undefined)
        .map((point) => [point.x, point.y] as const),
    };
    inkCacheRef.current.set(index, bounds);
    return bounds;
  }

  function markFromFrame(bitmap: ImageBitmap, cssPerPx: number): GoboMark {
    const base = inkOf(bitmap, 0);
    const centerPx = (base.minX + base.maxX) / 2;
    const centerPy = (base.minY + base.maxY) / 2;
    return {
      width: Math.max(1, base.maxX - base.minX + 1) * cssPerPx,
      height: Math.max(1, base.maxY - base.minY + 1) * cssPerPx,
      rotation: frameIndex(angleRef.current) * FRAME_STEP_DEGREES,
      centerX: (centerPx - bitmap.width / 2) * cssPerPx,
      centerY: (centerPy - bitmap.height / 2) * cssPerPx,
      outline: base.outline.map(([x, y]) => [x * cssPerPx, y * cssPerPx] as const),
    };
  }

  function floorCrop(index: number) {
    const bitmap = framesRef.current[index];
    const cssPerPx = cssSizeRef.current / bitmap.width;
    const ink = inkOf(bitmap, index);
    const pad = 4;
    const srcX = Math.max(0, ink.minX - pad);
    const srcY = Math.max(0, ink.minY - pad);
    const srcW = Math.min(bitmap.width - srcX, ink.maxX - ink.minX + 1 + pad * 2);
    const srcH = Math.min(bitmap.height - srcY, ink.maxY - ink.minY + 1 + pad * 2);
    const cropCx = srcX + srcW / 2;
    const cropCy = srcY + srcH / 2;
    const inkCx = (ink.minX + ink.maxX) / 2;
    const inkCy = (ink.minY + ink.maxY) / 2;
    const points =
      ink.outline.length >= 2
        ? ink.outline.map(([x, y]) => [(x + inkCx - cropCx) * cssPerPx, (y + inkCy - cropCy) * cssPerPx] as const)
        : ([
            [-((ink.maxX - ink.minX) * cssPerPx) / 2, -((ink.maxY - ink.minY) * cssPerPx) / 2],
            [((ink.maxX - ink.minX) * cssPerPx) / 2, -((ink.maxY - ink.minY) * cssPerPx) / 2],
            [((ink.maxX - ink.minX) * cssPerPx) / 2, ((ink.maxY - ink.minY) * cssPerPx) / 2],
            [-((ink.maxX - ink.minX) * cssPerPx) / 2, ((ink.maxY - ink.minY) * cssPerPx) / 2],
          ] as const);
    return { cssHeight: srcH * cssPerPx, points };
  }

  function floorScale(index: number) {
    const frames = framesRef.current;
    const projector = settingsRef.current.projectorAngle;
    if (!frames[0] || !frames[index]) return undefined;
    const key = `${projector}:${cssSizeRef.current}:${frames.length}`;
    let cached = floorFitRef.current;
    if (!cached || cached.key !== key) {
      const step = Math.max(1, Math.round(15 / FRAME_STEP_DEGREES));
      const samples = [floorCrop(0)];
      for (let sample = step; sample < frames.length; sample += step) samples.push(floorCrop(sample));
      const steady = floorSteadyScale(projector, samples, window.innerWidth, window.innerHeight);
      cached = { key, refSpan: steady.refSpan, shrink: steady.shrink };
      floorFitRef.current = cached;
    }
    if (!(cached.refSpan > 0)) return undefined;
    const current = floorCrop(index);
    let span = 0;
    const projected = floorProjectLocals(projector, current.cssHeight, current.points, 1);
    for (let i = 0; i < projected.length; i += 1) {
      for (let j = i + 1; j < projected.length; j += 1) {
        span = Math.max(span, Math.hypot(projected[i][0] - projected[j][0], projected[i][1] - projected[j][1]));
      }
    }
    if (!(span > 0)) return undefined;
    return (cached.refSpan / span) * cached.shrink;
  }

  function drawFloorKeystone(
    canvas: HTMLCanvasElement,
    bitmap: ImageBitmap,
    index: number,
    cssSize: number,
  ) {
    const { minX, maxX, minY, maxY } = inkOf(bitmap, index);
    const pad = 4;
    const srcX = Math.max(0, minX - pad);
    const srcY = Math.max(0, minY - pad);
    const srcW = Math.min(bitmap.width - srcX, maxX - minX + 1 + pad * 2);
    const srcH = Math.min(bitmap.height - srcY, maxY - minY + 1 + pad * 2);
    if (canvas.width !== srcW || canvas.height !== srcH) {
      canvas.width = srcW;
      canvas.height = srcH;
    }
    const cssPerPx = cssSize / bitmap.width;
    const cssW = srcW * cssPerPx;
    const cssH = srcH * cssPerPx;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const inkCx = srcX + srcW / 2;
    const inkCy = srcY + srcH / 2;
    floorBoxRef.current = {
      w: cssW,
      h: cssH,
      ox: (inkCx - bitmap.width / 2) * cssPerPx,
      oy: (inkCy - bitmap.height / 2) * cssPerPx,
    };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  }

  function applyPlacement() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const surface = settingsRef.current.surface;
    const box = floorBoxRef.current;
    const mark = markRef.current.width > 1 && markRef.current.height > 1 ? markRef.current : undefined;
    const warp = surface === "floor" && settingsRef.current.projectorAngle < PROJECTOR_MAX - 0.05;
    const floorScaleNow = warp && shownFrameRef.current >= 0 ? floorScale(shownFrameRef.current) : undefined;
    const next =
      surface === "floor"
        ? floorThrowTransform(
            settingsRef.current.projectorAngle,
            box.w,
            box.h,
            box.ox,
            box.oy,
            window.innerWidth,
            window.innerHeight,
            mark,
            floorScaleNow,
          )
        : projectorTransform(
            settingsRef.current.projectorAngle,
            cssSizeRef.current,
            window.innerWidth,
            window.innerHeight,
            surface,
            mark,
          );
    canvas.dataset.projector = String(settingsRef.current.projectorAngle);
    canvas.dataset.surface = settingsRef.current.surface;
    if (placementRef.current === next) return;
    placementRef.current = next;
    canvas.style.transform = next;
  }

  function releaseFrames() {
    framesRef.current.forEach((frame) => frame.close());
    framesRef.current = [];
    shownFrameRef.current = -1;
    inkCacheRef.current.clear();
    floorFitRef.current = null;
    markRef.current = { width: 0, height: 0, rotation: 0, centerX: 0, centerY: 0 };
  }

  function clearHideTimer() {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      openRef.current = false;
      document.documentElement.classList.add("gobo-hide-cursor");
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
      setOpen(false);
    }, HIDE_AFTER_MS);
  }

  function setPanel(next: boolean) {
    if (next) {
      const rotation = normalizeAngle(angleRef.current);
      const rounded = Math.round(rotation * 10) / 10;
      if (rounded !== settingsRef.current.rotation) {
        shownRef.current = Math.round(rounded);
        const updated = { ...settingsRef.current, rotation: rounded };
        settingsRef.current = updated;
        setSettings(updated);
      }
    }
    openRef.current = next;
    document.documentElement.classList.toggle("gobo-hide-cursor", !next);
    if (!next) {
      clearHideTimer();
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
    } else {
      scheduleHide();
    }
    setOpen(next);
  }

  function update(patch: Partial<GoboSettings>) {
    const rotation =
      patch.rotation !== undefined
        ? patch.rotation
        : Math.round(normalizeAngle(angleRef.current) * 10) / 10;
    if (patch.rotation !== undefined) angleRef.current = patch.rotation;
    shownRef.current = Math.round(rotation);
    const next = { ...settingsRef.current, ...patch, rotation };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
    if (patch.projectorAngle !== undefined || patch.surface !== undefined) {
      shownFrameRef.current = -1;
      paintFrame();
    }
    if (openRef.current) scheduleHide();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (openRef.current) {
          event.preventDefault();
          setPanel(false);
        }
        return;
      }

      if (isControlFocused()) {
        if (openRef.current) scheduleHide();
        return;
      }

      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (event.repeat) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const spin = Math.min(
          SPIN_MAX,
          Math.max(SPIN_MIN, settingsRef.current.spin + direction * SPIN_STEP),
        );
        update({ spin });
        return;
      }

      if ((event.key === "f" || event.key === "F") && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        toggleFullscreen();
        if (openRef.current) scheduleHide();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || IGNORED_KEYS.has(event.key)) return;

      setPanel(true);
    }

    function onPointerActivity() {
      if (openRef.current) scheduleHide();
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onPointerActivity);
    window.addEventListener("pointerdown", onPointerActivity);
    window.addEventListener("wheel", onPointerActivity, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointerActivity);
      window.removeEventListener("pointerdown", onPointerActivity);
      window.removeEventListener("wheel", onPointerActivity);
      clearHideTimer();
    };
    // Handlers read the latest panel state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastPersist = last;

    const persistAngle = () => {
      const rotation = Math.round(normalizeAngle(angleRef.current) * 10) / 10;
      const next = { ...settingsRef.current, rotation };
      settingsRef.current = next;
      saveSettings(next);
      if (openRef.current) setSettings(next);
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const speed = settingsRef.current.spin;
      if (speed !== 0 && dt > 0) {
        angleRef.current += speed * dt;
        const rotation = Math.round(normalizeAngle(angleRef.current) * 10) / 10;
        const shown = Math.round(rotation);
        if (openRef.current && shown !== shownRef.current) {
          shownRef.current = shown;
          const next = { ...settingsRef.current, rotation };
          settingsRef.current = next;
          setSettings(next);
        }
        if (now - lastPersist >= 500) {
          lastPersist = now;
          const next = { ...settingsRef.current, rotation };
          settingsRef.current = next;
          saveSettings(next);
        }
      }
      paintFrame();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        persistAngle();
        return;
      }
      last = performance.now();
    };
    window.addEventListener("pagehide", persistAngle);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pagehide", persistAngle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // The loop reads the latest spin and frames through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const font = getFont(settings.font);
  const visible = hasVisibleText(settings.text);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === "undefined" ? 1 : window.innerWidth,
    h: typeof window === "undefined" ? 1 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    shownFrameRef.current = -1;
    paintFrame();
    // Redraws through refs when the throw changes. The spin loop is separate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.projectorAngle, settings.surface, viewport.w, viewport.h]);

  const frameKey = [
    settings.text,
    settings.font,
    settings.size,
    settings.color,
    settings.outline,
    settings.outlineWidth,
    settings.outlineColor,
    settings.glow,
    settings.letterSpacing,
    settings.lineHeight,
    settings.align,
    viewport.w,
    viewport.h,
  ].join("\u0000");

  useEffect(() => {
    if (!hasVisibleText(settings.text)) {
      releaseFrames();
      return;
    }
    const generation = ++buildRef.current;
    const vmin = Math.min(viewport.w, viewport.h) / 100;
    const fontPx = settings.size * vmin;
    const glow = settings.glow / 100;
    let cancelled = false;
    void renderGoboFrames(
      {
        text: settings.text,
        color: settings.color,
        fontStack: font.stack,
        fontWeight: font.weight,
        fontPx,
        letterSpacingEm: settings.letterSpacing,
        lineHeight: settings.lineHeight,
        align: settings.align,
        outline: settings.outline,
        outlinePx: settings.outline ? settings.outlineWidth * 0.012 * fontPx : 0,
        outlineColor: settings.outlineColor,
        glowWidePx: glow * 3.4 * vmin,
        glowTightPx: glow * 1.1 * vmin,
        maxWidthPx: viewport.w * 0.92,
      },
      (bitmap, cssSize) => {
        if (cancelled || generation !== buildRef.current || framesRef.current.length > 0) return;
        cssSizeRef.current = cssSize;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.style.width = `${cssSize}px`;
        canvas.style.height = `${cssSize}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
      },
      () => !cancelled && generation === buildRef.current,
    ).then((set) => {
      if (cancelled || generation !== buildRef.current) {
        set.frames.forEach((bitmap) => bitmap.close());
        return;
      }
      const previous = framesRef.current;
      framesRef.current = set.frames;
      cssSizeRef.current = set.cssSize;
      shownFrameRef.current = -1;
      inkCacheRef.current.clear();
      floorFitRef.current = null;
      const first = set.frames[0];
      if (first && first.width > 0) {
        markRef.current = markFromFrame(first, set.cssSize / first.width);
      }
      previous.forEach((bitmap) => bitmap.close());
      const canvas = canvasRef.current;
      if (canvas) canvas.dataset.frames = String(set.frames.length);
      paintFrame();
    });
    return () => {
      cancelled = true;
    };
    // frameKey already lists every visual field this raster depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  return (
    <main
      className="gobo-stage"
      data-panel={open ? "open" : "closed"}
      data-spin={settings.spin}
      data-projector={settings.projectorAngle}
      data-surface={settings.surface}
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof Node && panelRef.current?.contains(target)) return;
        setPanel(true);
      }}
    >
      {visible ? (
        <canvas
          id="gobo"
          ref={bindCanvas}
          className="gobo-reel"
          data-testid="gobo"
          data-spin={settings.spin}
          aria-label={settings.text}
        />
      ) : null}

      {open ? (
        <div
          ref={panelRef}
          className="gobo-panel"
          role="dialog"
          aria-label="Gobo controls"
          data-testid="panel"
        >
          <div className="gobo-panel-head">
            <h2>Gobo</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="gobo-close"
              aria-label="Close panel"
              onClick={() => setPanel(false)}
            >
              ×
            </Button>
          </div>
          <div className="gobo-panel-body">
            <div className="gobo-field">
              <Label htmlFor="gobo-text" className="gobo-field-label">
                Gobo text
              </Label>
              <Textarea
                id="gobo-text"
                value={settings.text}
                rows={3}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                placeholder="One line per row"
                onPointerDown={(event) => event.currentTarget.focus()}
                onChange={(event) => update({ text: event.target.value })}
              />
            </div>

            <div className="gobo-field">
              <Label className="gobo-field-label" id="gobo-font-label">
                Font
              </Label>
              <Select
                modal={false}
                items={Object.fromEntries(FONT_OPTIONS.map((item) => [item.value, item.label]))}
                value={settings.font}
                onValueChange={(value) => {
                  if (typeof value === "string") update({ font: value });
                }}
              >
                <SelectTrigger className="w-full" aria-labelledby="gobo-font-label" style={{ fontFamily: font.stack }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="z-[80]">
                  {FONT_GROUPS.map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {FONT_OPTIONS.filter((item) => item.group === group).map((item) => (
                        <SelectItem
                          key={item.value}
                          value={item.value}
                          style={{ fontFamily: item.stack, fontWeight: item.weight }}
                        >
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SliderField
              id="gobo-size"
              label="Size"
              valueLabel={`${settings.size}%`}
              min={2}
              max={80}
              step={1}
              value={settings.size}
              onChange={(size) => update({ size })}
            />

            <div className="gobo-field">
              <Label htmlFor="gobo-spin" className="gobo-field-label">
                Rotation
                <span>{formatSpeed(settings.spin)}</span>
              </Label>
              <div className="gobo-bipolar">
                <span className="gobo-bipolar-zero" aria-hidden="true" />
                <Slider
                  id="gobo-spin"
                  min={SPIN_MIN}
                  max={SPIN_MAX}
                  step={1}
                  value={[Math.round(settings.spin)]}
                  aria-label="Rotation speed"
                  onValueChange={(next) => update({ spin: sliderNumber(next) })}
                />
              </div>
              <p className="gobo-speed" data-testid="angle-readout">
                {angleCaption(settings.rotation, settings.spin)}
              </p>
            </div>

            <div className="gobo-field">
              <Label className="gobo-field-label" id="gobo-surface-label">
                Surface
              </Label>
              <div className="gobo-surface" role="group" aria-labelledby="gobo-surface-label">
                <Button
                  type="button"
                  variant={settings.surface === "floor" ? "default" : "secondary"}
                  aria-pressed={settings.surface === "floor"}
                  onClick={() => update({ surface: "floor" })}
                >
                  Floor
                </Button>
                <Button
                  type="button"
                  variant={settings.surface === "wall" ? "default" : "secondary"}
                  aria-pressed={settings.surface === "wall"}
                  onClick={() => update({ surface: "wall" })}
                >
                  Wall
                </Button>
              </div>
            </div>

            <div className="gobo-field">
              <Label htmlFor="gobo-projector" className="gobo-field-label">
                Projector
                <span>{formatDegrees(settings.projectorAngle)}</span>
              </Label>
              <Slider
                id="gobo-projector"
                min={PROJECTOR_MIN}
                max={PROJECTOR_MAX}
                step={1}
                value={[settings.projectorAngle]}
                aria-label="Projector angle"
                onValueChange={(next) => update({ projectorAngle: sliderNumber(next) })}
              />
              <p className="gobo-speed">
                {settings.surface === "floor"
                  ? "0° is a horizontal beam, with the full floor keystone. 90° points straight down and has no skew."
                  : "0° aims straight at the wall. Raising it pitches the projector off that aim."}
              </p>
            </div>

            <div className="gobo-colors">
              <div className="gobo-field">
                <Label htmlFor="gobo-color" className="gobo-field-label">
                  Color
                </Label>
                <Input
                  id="gobo-color"
                  type="color"
                  value={settings.color}
                  aria-label="Text color"
                  onChange={(event) => update({ color: event.target.value })}
                />
              </div>
              <div className={`gobo-field ${settings.outline ? "" : "gobo-dimmed"}`}>
                <Label htmlFor="gobo-outline-color" className="gobo-field-label">
                  Outline color
                </Label>
                <Input
                  id="gobo-outline-color"
                  type="color"
                  value={settings.outlineColor}
                  disabled={!settings.outline}
                  aria-label="Outline color"
                  onChange={(event) => update({ outlineColor: event.target.value })}
                />
              </div>
            </div>

            <SliderField
              id="gobo-tracking"
              label="Letter spacing"
              valueLabel={`${settings.letterSpacing.toFixed(2)} em`}
              min={-0.08}
              max={0.5}
              step={0.01}
              value={settings.letterSpacing}
              onChange={(letterSpacing) => update({ letterSpacing })}
            />

            <SliderField
              id="gobo-leading"
              label="Line height"
              valueLabel={settings.lineHeight.toFixed(2)}
              min={0.8}
              max={2}
              step={0.05}
              value={settings.lineHeight}
              onChange={(lineHeight) => update({ lineHeight })}
            />

            <div className="gobo-field">
              <Label className="gobo-field-label" id="gobo-align-label">
                Alignment
              </Label>
              <Select
                modal={false}
                items={ALIGN_ITEMS}
                value={settings.align}
                onValueChange={(value) => {
                  if (value === "left" || value === "center" || value === "right") {
                    update({ align: value satisfies TextAlign });
                  }
                }}
              >
                <SelectTrigger className="w-full" aria-labelledby="gobo-align-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="z-[80]">
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Label className="gobo-check" htmlFor="gobo-outline">
              <Switch
                id="gobo-outline"
                checked={settings.outline}
                onCheckedChange={(outline) => update({ outline })}
              />
              Outline
            </Label>

            <div className={settings.outline ? undefined : "gobo-dimmed"}>
              <SliderField
                id="gobo-outline-width"
                label="Outline width"
                valueLabel={String(settings.outlineWidth)}
                min={1}
                max={16}
                step={1}
                value={settings.outlineWidth}
                disabled={!settings.outline}
                onChange={(outlineWidth) => update({ outlineWidth })}
              />
            </div>

            <SliderField
              id="gobo-glow"
              label="Soft glow"
              valueLabel={`${settings.glow}%`}
              min={0}
              max={100}
              step={1}
              value={settings.glow}
              onChange={(glow) => update({ glow })}
            />

            <div className="gobo-field">
              <Button type="button" variant="secondary" className="gobo-menu-btn" onClick={toggleFullscreen}>
                Fullscreen
              </Button>
            </div>

            <p className="gobo-hint">
              Click the stage or press any unassigned key to open this panel. Esc closes it. F toggles
              fullscreen. Rotation sets the spin directly: the middle is stopped, left is
              counterclockwise, and right is clockwise, up to {SPIN_MAX}°/s. Left and right arrows add{" "}
              {SPIN_STEP}°/s on top of that and can reverse it. At zero speed the gobo holds its angle.
              On the floor, a horizontal beam at 0° gets the full keystone, and straight down at 90° has
              none. On a wall, 0° aims straight with no skew, and a higher angle pitches off that aim.
              The panel hides after 4 seconds of
              quiet, and every change is kept in this browser. Clear the text for a pure black frame.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SliderField({
  id,
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="gobo-field">
      <Label htmlFor={id} className="gobo-field-label">
        {label}
        <span>{valueLabel}</span>
      </Label>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={[value]}
        aria-label={label}
        onValueChange={(next) => onChange(sliderNumber(next))}
      />
    </div>
  );
}
