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
import { FONT_GROUPS, FONT_OPTIONS, getFont } from "@/lib/fonts";
import {
  HIDE_AFTER_MS,
  ROTATION_MAX,
  ROTATION_MIN,
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

function paintAngle(node: HTMLDivElement | null, angle: number) {
  const normalized = normalizeAngle(angle);
  if (!node) return normalized;
  node.style.setProperty("--gobo-rotation", `${normalized}deg`);
  node.dataset.rotation = normalized.toFixed(2);
  return normalized;
}

function rotationSliderActive() {
  const element = document.activeElement;
  return element instanceof Element && Boolean(element.closest("#gobo-rotation"));
}

function formatDegrees(value: number) {
  const rounded = Math.round(value);
  return `${rounded}°`;
}

function spinCaption(spin: number) {
  if (spin === 0) return "Holding this angle";
  const rate = Number.isInteger(spin) ? String(Math.abs(spin)) : Math.abs(spin).toFixed(1);
  return `${rate}°/s ${spin > 0 ? "clockwise" : "counterclockwise"}`;
}

function glowFilter(strength: number, color: string) {
  if (strength <= 0) return "none";
  const amount = strength / 100;
  const tight = (amount * 1.1).toFixed(3);
  const wide = (amount * 3.4).toFixed(3);
  return `drop-shadow(0 0 ${tight}vmin ${color}) drop-shadow(0 0 ${wide}vmin ${color})`;
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
  const goboRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(settings.rotation);
  const shownRef = useRef(Math.round(settings.rotation));
  const draggingAngle = useRef(false);
  const settingsRef = useRef(settings);

  const bindGobo = useCallback((node: HTMLDivElement | null) => {
    goboRef.current = node;
    paintAngle(node, angleRef.current);
  }, []);

  function applyAngle(angle: number) {
    angleRef.current = paintAngle(goboRef.current, angle);
  }

  function beginAngleDrag() {
    if (draggingAngle.current) return;
    draggingAngle.current = true;
    const stop = () => {
      draggingAngle.current = false;
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
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
    shownRef.current = Math.round(rotation);
    const next = { ...settingsRef.current, ...patch, rotation };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
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
        const rotation = Math.round(normalizeAngle(angleRef.current) * 10) / 10;
        update({ spin, rotation });
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
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      const speed = settingsRef.current.spin;
      const held = draggingAngle.current || rotationSliderActive();
      if (speed !== 0 && !held && dt > 0) {
        applyAngle(angleRef.current + speed * dt);
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
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistAngle();
    };
    window.addEventListener("pagehide", persistAngle);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pagehide", persistAngle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const font = getFont(settings.font);
  const visible = hasVisibleText(settings.text);
  const outlineWidth = `${(settings.outlineWidth * 0.012).toFixed(4)}em`;

  return (
    <main
      className="gobo-stage"
      data-panel={open ? "open" : "closed"}
      data-spin={settings.spin}
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof Node && panelRef.current?.contains(target)) return;
        setPanel(true);
      }}
    >
      {visible ? (
        <div
          id="gobo"
          ref={bindGobo}
          className="gobo-word"
          data-testid="gobo"
          data-spin={settings.spin}
          style={{
            color: settings.color,
            fontFamily: font.stack,
            fontSize: `${settings.size}vmin`,
            fontWeight: font.weight,
            letterSpacing: `${settings.letterSpacing}em`,
            lineHeight: settings.lineHeight,
            textAlign: settings.align,
            WebkitTextStroke: settings.outline
              ? `${outlineWidth} ${settings.outlineColor}`
              : "0 transparent",
            paintOrder: "stroke fill",
            filter: glowFilter(settings.glow, settings.color),
          }}
        >
          {settings.text}
        </div>
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
              <Label htmlFor="gobo-rotation" className="gobo-field-label">
                Rotation
                <span>{formatDegrees(settings.rotation)}</span>
              </Label>
              <div className="gobo-bipolar" onPointerDown={beginAngleDrag}>
                <span className="gobo-bipolar-zero" aria-hidden="true" />
                <Slider
                  id="gobo-rotation"
                  min={ROTATION_MIN}
                  max={ROTATION_MAX}
                  step={1}
                  value={[Math.round(settings.rotation)]}
                  aria-label="Rotation"
                  onValueChange={(next) => {
                    const rotation = sliderNumber(next);
                    applyAngle(rotation);
                    update({ rotation });
                  }}
                />
              </div>
              <p className="gobo-speed" data-testid="spin-readout">
                {spinCaption(settings.spin)}
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
              fullscreen. Left and right arrows add {SPIN_STEP}°/s of counterclockwise or clockwise
              spin, up to {SPIN_MAX}°/s. Opposite presses slow it and can reverse it. At zero speed
              the gobo holds its angle. The panel hides after 4 seconds of quiet, and every change is
              kept in this browser. Clear the text for a pure black frame.
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
