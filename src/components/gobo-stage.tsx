"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
import { ProjectorDial } from "@/components/projector-dial";
import {
  frameIndex,
  isGoboImageFile,
  rasterizeGoboFile,
  renderGoboFrames,
  renderImageGoboFrames,
} from "@/lib/gobo-frames";
import { parseHex, rgbToHex } from "@/lib/gobo-key";
import { clearGoboImage, loadGoboImage, saveGoboImage } from "@/lib/gobo-store";
import { angleFromSpot, clampSpot, spotForAngle, type BeamSpot } from "@/lib/placement";
import { PROJECTOR_MAX, PROJECTOR_MIN, keystoneFor } from "@/lib/projector";
import { FONT_GROUPS, FONT_OPTIONS, getFont } from "@/lib/fonts";
import {
  HIDE_AFTER_MS,
  SPIN_MAX,
  SPIN_MIN,
  SPIN_STEP,
  defaultSettings,
  type GoboSettings,
  type GoboSource,
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
  "button",
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
  return `At ${angle}`;
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
  const [imageMaster, setImageMaster] = useState<HTMLCanvasElement | null>(null);
  const [imageError, setImageError] = useState("");
  const imageToken = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const bindCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    shownFrameRef.current = -1;
  }, []);

  function paintFrame() {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || frames.length === 0) return;
    const index = frameIndex(angleRef.current);
    const cssSize = cssSizeRef.current;
    const stamp = `${settingsRef.current.projectorSpot}:${settingsRef.current.projectorAngle}:${cssSize}:${window.innerWidth}x${window.innerHeight}`;
    if (index === shownFrameRef.current && canvas.dataset.placement === stamp) return;
    const bitmap = frames[index];
    if (!bitmap) return;
    drawSquare(canvas, bitmap, cssSize);
    shownFrameRef.current = index;
    canvas.dataset.placement = stamp;
    canvas.dataset.rotation = normalizeAngle(angleRef.current).toFixed(2);
    canvas.dataset.frame = String(index);
    applyPlacement();
  }

  function drawSquare(canvas: HTMLCanvasElement, bitmap: ImageBitmap, cssSize: number) {
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    const size = `${cssSize}px`;
    if (canvas.style.width !== size) canvas.style.width = size;
    if (canvas.style.height !== size) canvas.style.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  }

  function applyPlacement() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssSize = cssSizeRef.current;
    if (!(cssSize > 0)) return;
    const target = settingsRef.current.projectorSpot === "wall" ? "wall" : "floor";
    const placed = keystoneFor(
      settingsRef.current.projectorAngle,
      cssSize,
      window.innerWidth,
      window.innerHeight,
      target,
    );
    canvas.dataset.homography = JSON.stringify(placed.matrix);
    canvas.dataset.projector = String(settingsRef.current.projectorAngle);
    canvas.dataset.keystone = target;
    canvas.dataset.surface = "floor";
    if (placementRef.current === placed.css) return;
    placementRef.current = placed.css;
    canvas.style.transform = placed.css;
  }

  function releaseFrames() {
    framesRef.current.forEach((frame) => frame.close());
    framesRef.current = [];
    shownFrameRef.current = -1;
    placementRef.current = "";
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
    if (
      patch.projectorAngle !== undefined ||
      patch.projectorDistance !== undefined ||
      patch.projectorHeight !== undefined ||
      patch.projectorAim !== undefined ||
      patch.projectorSpot !== undefined ||
      patch.projectorSpotHeight !== undefined ||
      patch.surface !== undefined
    ) {
      shownFrameRef.current = -1;
      paintFrame();
    }
    if (openRef.current) scheduleHide();
  }

  function aimAt(angle: number) {
    const current = settingsRef.current;
    const towardWall = current.projectorSpot === "wall" || current.projectorAim <= current.projectorDistance;
    const placed = spotForAngle(current.projectorDistance, current.projectorHeight, angle, towardWall);
    update(withSpot(current.projectorDistance, current.projectorHeight, placed.spot));
  }

  async function takePicture(file: File) {
    setImageError("");
    try {
      if (!isGoboImageFile(file)) throw new Error("unsupported");
      const canvas = await rasterizeGoboFile(file);
      await saveGoboImage(file, file.name);
      imageToken.current += 1;
      setImageMaster(canvas);
      update({ source: "image", imageName: file.name });
    } catch {
      setImageError("That file couldn't be read. Use PNG, JPG, WebP, GIF, or SVG.");
    }
  }

  async function clearPicture(patch: Partial<GoboSettings> = {}) {
    setImageError("");
    imageToken.current += 1;
    setImageMaster(null);
    update({ imageName: "", ...patch });
    try {
      await clearGoboImage();
    } catch {
      setImageError("The picture could not be cleared.");
    }
  }

  async function pickScreenColor() {
    const Dropper = (
      window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }
    ).EyeDropper;
    if (!Dropper) {
      setImageError("This browser has no screen eyedropper. Click the picture instead.");
      return;
    }
    try {
      const result = await new Dropper().open();
      const hex = result.sRGBHex.toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(hex)) update({ chromaColor: hex, chromaKey: true });
    } catch {
      // The user dismissed the dropper.
    }
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

      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const step = (event.shiftKey ? 5 : 1) * (event.key === "ArrowUp" ? 1 : -1);
        const current = Math.round(settingsRef.current.projectorAngle);
        const next = Math.min(PROJECTOR_MAX, Math.max(PROJECTOR_MIN, current + step));
        if (next !== current) aimAt(next);
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
  const imageMode = settings.source === "image";
  const visible = imageMode ? imageMaster !== null : hasVisibleText(settings.text);
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
    if (settings.surface === "floor") return;
    update({ surface: "floor" });
    // Older saves stored a wall throw. The picture is always the floor keystone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.surface]);

  useEffect(() => {
    shownFrameRef.current = -1;
    paintFrame();
    // Redraws through refs when the throw changes. The spin loop is separate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.projectorAngle, settings.projectorSpot, settings.surface, viewport.w, viewport.h]);

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
    if (settings.source !== "text") return;
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
      placementRef.current = "";
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
  }, [frameKey, settings.source]);

  useEffect(() => {
    let cancelled = false;
    void loadGoboImage()
      .then(async (record) => {
        if (cancelled || !record) return;
        const canvas = await rasterizeGoboFile(new File([record.blob], record.name, { type: record.type }));
        if (cancelled) return;
        imageToken.current += 1;
        setImageMaster(canvas);
        if (settingsRef.current.imageName !== record.name) update({ imageName: record.name });
      })
      .catch(() => {
        if (!cancelled) setImageError("The saved picture could not be opened.");
      });
    return () => {
      cancelled = true;
    };
    // Load the stored picture once. Later uploads replace it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    const master = imageMaster;
    if (!preview || !master) return;
    const width = 220;
    const height = Math.max(48, Math.round((width * master.height) / master.width));
    preview.width = width;
    preview.height = Math.min(height, 120);
    const ctx = preview.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, preview.width, preview.height);
    const scale = Math.min(preview.width / master.width, preview.height / master.height);
    const drawW = master.width * scale;
    const drawH = master.height * scale;
    ctx.drawImage(master, (preview.width - drawW) / 2, (preview.height - drawH) / 2, drawW, drawH);
  }, [imageMaster, open, settings.source]);

  const imageFrameKey = [
    settings.source,
    settings.size,
    settings.color,
    settings.lumaKey,
    settings.lumaThreshold,
    settings.lumaSoftness,
    settings.lumaInvert,
    settings.chromaKey,
    settings.chromaColor,
    settings.chromaTolerance,
    settings.chromaSoftness,
    settings.chromaSpill,
    settings.imageTint,
    imageToken.current,
    viewport.w,
    viewport.h,
  ].join("\u0000");

  useEffect(() => {
    if (settings.source !== "image") return;
    if (!imageMaster) {
      releaseFrames();
      return;
    }
    const generation = ++buildRef.current;
    const vmin = Math.min(viewport.w, viewport.h) / 100;
    let cancelled = false;
    void renderImageGoboFrames(
      imageMaster,
      settings.size * vmin,
      {
        lumaKey: settings.lumaKey,
        lumaThreshold: settings.lumaThreshold / 100,
        lumaSoftness: settings.lumaSoftness / 100,
        lumaInvert: settings.lumaInvert,
        chromaKey: settings.chromaKey,
        chroma: parseHex(settings.chromaColor),
        chromaTolerance: settings.chromaTolerance / 100,
        chromaSoftness: settings.chromaSoftness / 100,
        chromaSpill: settings.chromaSpill / 100,
        tint: settings.imageTint,
        tintColor: parseHex(settings.color),
      },
      (bitmap, cssSize) => {
        if (cancelled || generation !== buildRef.current) return;
        void createImageBitmap(bitmap)
          .then((preview) => {
            if (cancelled || generation !== buildRef.current) {
              preview.close();
              return;
            }
            cssSizeRef.current = cssSize;
            const previous = framesRef.current;
            framesRef.current = [preview];
            shownFrameRef.current = -1;
            placementRef.current = "";
            previous.forEach((item) => item.close());
            const canvas = canvasRef.current;
            if (canvas) canvas.dataset.frames = "1";
            paintFrame();
          })
          .catch(() => {
            // The source frame was dropped before it could be copied.
          });
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
      placementRef.current = "";
      previous.forEach((bitmap) => bitmap.close());
      const canvas = canvasRef.current;
      if (canvas) canvas.dataset.frames = String(set.frames.length);
      paintFrame();
    });
    return () => {
      cancelled = true;
    };
    // imageFrameKey lists every field this raster depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFrameKey, imageMaster]);

  return (
    <main
      className="gobo-stage"
      data-panel={open ? "open" : "closed"}
      data-spin={settings.spin}
      data-projector={settings.projectorAngle}
      data-keystone={settings.projectorSpot}
      data-surface={settings.surface}
      data-source={settings.source}
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
          aria-label={imageMode ? settings.imageName || "Image gobo" : settings.text}
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
            <PanelSection
              className="gobo-col-projection"
              title="Projection"
              value={formatDegrees(settings.projectorAngle)}
              changed={sectionChanged(settings, [
                "projectorAngle",
                "projectorDistance",
                "projectorHeight",
                "projectorAim",
                "projectorSpot",
                "projectorSpotHeight",
              ])}
              onReset={() =>
                update({
                  projectorAngle: defaultSettings.projectorAngle,
                  projectorDistance: defaultSettings.projectorDistance,
                  projectorHeight: defaultSettings.projectorHeight,
                  projectorAim: defaultSettings.projectorAim,
                  projectorSpot: defaultSettings.projectorSpot,
                  projectorSpotHeight: defaultSettings.projectorSpotHeight,
                })
              }
            >
              <div className="gobo-field">
                <Label htmlFor="gobo-projector" className="gobo-field-label">
                  Angle
                  <span>{formatDegrees(settings.projectorAngle)}</span>
                </Label>
                <ProjectorDial
                  distance={settings.projectorDistance}
                  height={settings.projectorHeight}
                  spot={spotOf(settings)}
                  angle={settings.projectorAngle}
                  onPosition={(projectorDistance, projectorHeight) => {
                    const current = settingsRef.current;
                    update(withSpot(projectorDistance, projectorHeight, spotOf(current)));
                  }}
                  onSpot={(spot) => {
                    const { projectorDistance, projectorHeight } = settingsRef.current;
                    update(withSpot(projectorDistance, projectorHeight, spot));
                  }}
                  onAngle={(angle) => aimAt(angle)}
                />
                <p className="gobo-speed">
                  Drag the projector to place it. Drag the spot or the slider to aim. A shallow beam hits the
                  wall. 90° is straight down on the floor.
                </p>
                <Slider
                  id="gobo-projector"
                  min={PROJECTOR_MIN}
                  max={PROJECTOR_MAX}
                  step={1}
                  value={[settings.projectorAngle]}
                  aria-label="Projector angle"
                  onValueChange={(next) => aimAt(sliderNumber(next))}
                />
              </div>
            </PanelSection>

            <PanelSection
              className="gobo-col-source"
              title="Source"
              value={imageMode ? settings.imageName || "Image" : "Text"}
              changed={sectionChanged(settings, [
                "source",
                "text",
                "font",
                "align",
                "letterSpacing",
                "lineHeight",
                "imageName",
              ])}
              onReset={() => {
                void clearPicture({
                  source: defaultSettings.source,
                  text: defaultSettings.text,
                  font: defaultSettings.font,
                  align: defaultSettings.align,
                  letterSpacing: defaultSettings.letterSpacing,
                  lineHeight: defaultSettings.lineHeight,
                });
              }}
            >
              <div className="gobo-choice" role="group" aria-label="Gobo source">
                {(["text", "image"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="gobo-choice-btn"
                    aria-pressed={settings.source === choice}
                    onClick={() => update({ source: choice satisfies GoboSource })}
                  >
                    {choice === "text" ? "Text" : "Image"}
                  </button>
                ))}
              </div>
              {imageMode ? (
                <ImageSource
                  name={settings.imageName}
                  error={imageError}
                  ready={imageMaster !== null}
                  fileRef={fileRef}
                  previewRef={previewRef}
                  onPickFile={() => fileRef.current?.click()}
                  onFile={(file) => void takePicture(file)}
                  onClear={() => void clearPicture()}
                  onSample={(color) => update({ chromaColor: color, chromaKey: true })}
                />
              ) : (
                <>
              <div className="gobo-field">
                <Label htmlFor="gobo-text" className="gobo-field-label">
                  Text
                </Label>
                <Textarea
                  id="gobo-text"
                  value={settings.text}
                  rows={2}
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
                  <span>{font.label}</span>
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

              <div className="gobo-field">
                <Label className="gobo-field-label" id="gobo-align-label">
                  Alignment
                  <span>{ALIGN_ITEMS[settings.align]}</span>
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
                </>
              )}
            </PanelSection>

            {imageMode ? (
              <PanelSection
                className="gobo-col-key"
                title="Key"
                value={keySummary(settings)}
                changed={sectionChanged(settings, [
                  "lumaKey",
                  "lumaThreshold",
                  "lumaSoftness",
                  "lumaInvert",
                  "chromaKey",
                  "chromaColor",
                  "chromaTolerance",
                  "chromaSoftness",
                  "chromaSpill",
                  "imageTint",
                ])}
                onReset={() =>
                  update({
                    lumaKey: defaultSettings.lumaKey,
                    lumaThreshold: defaultSettings.lumaThreshold,
                    lumaSoftness: defaultSettings.lumaSoftness,
                    lumaInvert: defaultSettings.lumaInvert,
                    chromaKey: defaultSettings.chromaKey,
                    chromaColor: defaultSettings.chromaColor,
                    chromaTolerance: defaultSettings.chromaTolerance,
                    chromaSoftness: defaultSettings.chromaSoftness,
                    chromaSpill: defaultSettings.chromaSpill,
                    imageTint: defaultSettings.imageTint,
                  })
                }
              >
                <Label className="gobo-check" htmlFor="gobo-luma">
                  <Switch
                    id="gobo-luma"
                    checked={settings.lumaKey}
                    onCheckedChange={(lumaKey) => update({ lumaKey })}
                  />
                  <span className="gobo-check-name">Luma key</span>
                  <span className="gobo-check-value">{settings.lumaKey ? "On" : "Off"}</span>
                </Label>
                <div className={settings.lumaKey ? "gobo-split" : "gobo-split gobo-dimmed"}>
                  <SliderField
                    id="gobo-luma-threshold"
                    label="Threshold"
                    valueLabel={`${settings.lumaThreshold}%`}
                    min={0}
                    max={100}
                    step={1}
                    value={settings.lumaThreshold}
                    disabled={!settings.lumaKey}
                    onChange={(lumaThreshold) => update({ lumaThreshold })}
                  />
                  <SliderField
                    id="gobo-luma-softness"
                    label="Softness"
                    valueLabel={`${settings.lumaSoftness}%`}
                    min={0}
                    max={100}
                    step={1}
                    value={settings.lumaSoftness}
                    disabled={!settings.lumaKey}
                    onChange={(lumaSoftness) => update({ lumaSoftness })}
                  />
                </div>
                <Label className={`gobo-check ${settings.lumaKey ? "" : "gobo-dimmed"}`} htmlFor="gobo-luma-invert">
                  <Switch
                    id="gobo-luma-invert"
                    checked={settings.lumaInvert}
                    disabled={!settings.lumaKey}
                    onCheckedChange={(lumaInvert) => update({ lumaInvert })}
                  />
                  <span className="gobo-check-name">Invert</span>
                  <span className="gobo-check-value">{settings.lumaInvert ? "Knock out light" : "Knock out dark"}</span>
                </Label>

                <Label className="gobo-check" htmlFor="gobo-chroma">
                  <Switch
                    id="gobo-chroma"
                    checked={settings.chromaKey}
                    onCheckedChange={(chromaKey) => update({ chromaKey })}
                  />
                  <span className="gobo-check-name">Chroma key</span>
                  <span className="gobo-check-value">{settings.chromaKey ? "On" : "Off"}</span>
                </Label>
                <div className={settings.chromaKey ? "gobo-colors" : "gobo-colors gobo-dimmed"}>
                  <div className="gobo-field">
                    <Label htmlFor="gobo-chroma-color" className="gobo-field-label gobo-stack-label">
                      Key color
                      <span>{settings.chromaColor}</span>
                    </Label>
                    <Input
                      id="gobo-chroma-color"
                      type="color"
                      value={settings.chromaColor}
                      disabled={!settings.chromaKey}
                      aria-label="Chroma key color"
                      onChange={(event) => update({ chromaColor: event.target.value })}
                    />
                  </div>
                  <div className="gobo-field">
                    <Label className="gobo-field-label">Pick</Label>
                    <Button
                      type="button"
                      variant="secondary"
                      className="gobo-menu-btn"
                      disabled={!settings.chromaKey}
                      onClick={() => void pickScreenColor()}
                    >
                      From screen
                    </Button>
                  </div>
                </div>
                <div className={settings.chromaKey ? "gobo-split" : "gobo-split gobo-dimmed"}>
                  <SliderField
                    id="gobo-chroma-tolerance"
                    label="Tolerance"
                    valueLabel={`${settings.chromaTolerance}%`}
                    min={0}
                    max={100}
                    step={1}
                    value={settings.chromaTolerance}
                    disabled={!settings.chromaKey}
                    onChange={(chromaTolerance) => update({ chromaTolerance })}
                  />
                  <SliderField
                    id="gobo-chroma-soft"
                    label="Softness"
                    valueLabel={`${settings.chromaSoftness}%`}
                    min={0}
                    max={100}
                    step={1}
                    value={settings.chromaSoftness}
                    disabled={!settings.chromaKey}
                    onChange={(chromaSoftness) => update({ chromaSoftness })}
                  />
                </div>
                <div className={settings.chromaKey ? undefined : "gobo-dimmed"}>
                  <SliderField
                    id="gobo-chroma-spill"
                    label="Spill"
                    valueLabel={`${settings.chromaSpill}%`}
                    min={0}
                    max={100}
                    step={1}
                    value={settings.chromaSpill}
                    disabled={!settings.chromaKey}
                    onChange={(chromaSpill) => update({ chromaSpill })}
                  />
                </div>
              </PanelSection>
            ) : null}

            <div className="gobo-col-side">
            <PanelSection
              className="gobo-col-look"
              title="Look"
              value={imageMode ? `${settings.size}%${settings.imageTint ? ` · ${settings.color}` : ""}` : `${settings.size}% · ${settings.color}`}
              changed={sectionChanged(settings, [
                "color",
                "size",
                "outline",
                "outlineWidth",
                "outlineColor",
                "glow",
                "imageTint",
              ])}
              onReset={() =>
                update({
                  color: defaultSettings.color,
                  size: defaultSettings.size,
                  outline: defaultSettings.outline,
                  outlineWidth: defaultSettings.outlineWidth,
                  outlineColor: defaultSettings.outlineColor,
                  glow: defaultSettings.glow,
                  imageTint: defaultSettings.imageTint,
                })
              }
            >
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

              {imageMode ? (
                <Label className="gobo-check" htmlFor="gobo-tint">
                  <Switch
                    id="gobo-tint"
                    checked={settings.imageTint}
                    onCheckedChange={(imageTint) => update({ imageTint })}
                  />
                  <span className="gobo-check-name">Tint</span>
                  <span className="gobo-check-value">{settings.imageTint ? "On" : "Off"}</span>
                </Label>
              ) : null}

              {!imageMode || settings.imageTint ? (
              <div className="gobo-colors">
                <div className="gobo-field">
                    <Label htmlFor="gobo-color" className="gobo-field-label gobo-stack-label">
                    {imageMode ? "Tint color" : "Color"}
                    <span>{settings.color}</span>
                  </Label>
                  <Input
                    id="gobo-color"
                    type="color"
                    value={settings.color}
                    aria-label={imageMode ? "Tint color" : "Text color"}
                    onChange={(event) => update({ color: event.target.value })}
                  />
                </div>
                {imageMode ? null : (
                <div className={`gobo-field ${settings.outline ? "" : "gobo-dimmed"}`}>
                  <Label htmlFor="gobo-outline-color" className="gobo-field-label gobo-stack-label">
                    Outline color
                    <span>{settings.outlineColor}</span>
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
                )}
              </div>
              ) : null}

              {imageMode ? null : (
              <>
              <Label className="gobo-check" htmlFor="gobo-outline">
                <Switch
                  id="gobo-outline"
                  checked={settings.outline}
                  onCheckedChange={(outline) => update({ outline })}
                />
                <span className="gobo-check-name">Outline</span>
                <span className="gobo-check-value">{settings.outline ? "On" : "Off"}</span>
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
                label="Glow"
                valueLabel={`${settings.glow}%`}
                min={0}
                max={100}
                step={1}
                value={settings.glow}
                onChange={(glow) => update({ glow })}
              />
              </>
              )}
            </PanelSection>

            <PanelSection
              className="gobo-col-motion"
              title="Motion"
              value={settings.spin === 0 ? "Stopped" : formatSpeed(settings.spin)}
              changed={sectionChanged(settings, ["spin", "rotation"])}
              onReset={() => update({ spin: defaultSettings.spin, rotation: defaultSettings.rotation })}
            >
              <div className="gobo-field">
                <Label htmlFor="gobo-spin" className="gobo-field-label">
                  Spin
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
                    aria-label="Spin speed"
                    onValueChange={(next) => update({ spin: sliderNumber(next) })}
                  />
                </div>
                <p className="gobo-speed" data-testid="angle-readout">
                {angleCaption(settings.rotation, settings.spin)}
              </p>
              </div>
            </PanelSection>
            </div>

            <div className="gobo-col-foot">
            <div className="gobo-field">
              <Button type="button" variant="secondary" className="gobo-menu-btn" onClick={toggleFullscreen}>
                Fullscreen
              </Button>
            </div>

            <p className="gobo-hint">
              Click the stage or press any unassigned key to open this panel. Esc closes it. F toggles
              fullscreen. Spin sets the speed directly: the middle is stopped, left is counterclockwise, and
              right is clockwise, up to {SPIN_MAX}°/s. Left and right arrows add {SPIN_STEP}°/s and can
              reverse it. At zero speed the gobo holds its angle. Up and down arrows tilt the projector 1°,
              or 5° with Shift. While a control is focused, those keys stay with it. The panel hides after 4 seconds of quiet, and every change is kept in this browser.
              Choose Image to project a picture. Clear the text, or the picture, for a pure black frame.
            </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function spotOf(settings: GoboSettings): BeamSpot {
  if (settings.projectorSpot === "wall") return { surface: "wall", height: settings.projectorSpotHeight };
  return { surface: "floor", aim: settings.projectorAim };
}

function withSpot(distance: number, height: number, spot: BeamSpot) {
  const placed = clampSpot(height, spot);
  const projectorAngle = angleFromSpot(distance, height, placed);
  if (placed.surface === "wall") {
    return {
      projectorDistance: distance,
      projectorHeight: height,
      projectorAim: 0,
      projectorSpot: "wall" as const,
      projectorSpotHeight: placed.height,
      projectorAngle,
    };
  }
  return {
    projectorDistance: distance,
    projectorHeight: height,
    projectorAim: placed.aim,
    projectorSpot: "floor" as const,
    projectorSpotHeight: 0,
    projectorAngle,
  };
}

function sectionChanged(settings: GoboSettings, keys: readonly (keyof GoboSettings)[]) {
  return keys.some((key) => settings[key] !== defaultSettings[key]);
}

function keySummary(settings: GoboSettings) {
  const parts: string[] = [];
  if (settings.lumaKey) parts.push(settings.lumaInvert ? "Luma light" : "Luma dark");
  if (settings.chromaKey) parts.push("Chroma");
  if (settings.imageTint) parts.push("Tint");
  return parts.length > 0 ? parts.join(" · ") : "Off";
}

function ImageSource({
  name,
  error,
  ready,
  fileRef,
  previewRef,
  onPickFile,
  onFile,
  onClear,
  onSample,
}: {
  name: string;
  error: string;
  ready: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  previewRef: RefObject<HTMLCanvasElement | null>;
  onPickFile: () => void;
  onFile: (file: File) => void;
  onClear: () => void;
  onSample: (color: string) => void;
}) {
  return (
    <div className="gobo-image">
      <input
        id="gobo-file"
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
        className="gobo-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      {ready ? (
        <canvas
          ref={previewRef}
          className="gobo-preview"
          aria-label="Picture preview. Click a pixel to set the chroma key color."
          onClick={(event) => {
            const canvas = event.currentTarget;
            const rect = canvas.getBoundingClientRect();
            const x = Math.min(
              canvas.width - 1,
              Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width)),
            );
            const y = Math.min(
              canvas.height - 1,
              Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height)),
            );
            const pixel = canvas.getContext("2d")?.getImageData(x, y, 1, 1).data;
            if (!pixel) return;
            onSample(rgbToHex(pixel[0], pixel[1], pixel[2]));
          }}
        />
      ) : (
        <p className="gobo-speed">No picture yet. PNG, JPG, WebP, GIF, or SVG.</p>
      )}
      <div className="gobo-image-actions">
        <Button type="button" variant="secondary" className="gobo-menu-btn" onClick={onPickFile}>
          {ready ? "Replace" : "Upload"}
        </Button>
        <Button type="button" variant="secondary" className="gobo-menu-btn" onClick={onClear} disabled={!ready && !name}>
          Clear
        </Button>
      </div>
      {name ? <p className="gobo-speed">{name}</p> : null}
      {error ? <p className="gobo-error">{error}</p> : null}
      {ready ? <p className="gobo-speed">Click the picture to pick the key color.</p> : null}
    </div>
  );
}

function PanelSection({
  className,
  title,
  value,
  changed,
  onReset,
  children,
}: {
  className?: string;
  title: string;
  value: string;
  changed: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <section className={className ? `gobo-section ${className}` : "gobo-section"} aria-label={title}>
      <div className="gobo-section-head">
        <h3>{title}</h3>
        <span className="gobo-section-value">{value}</span>
        <button type="button" className="gobo-reset" onClick={onReset} disabled={!changed}>
          Reset
        </button>
      </div>
      {children}
    </section>
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
