"use client";

import { useEffect, useRef, useState } from "react";
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
  type GoboSettings,
  type TextAlign,
  hasVisibleText,
  loadSettings,
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
  const settingsRef = useRef(settings);

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
    const next = { ...settingsRef.current, ...patch };
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

  const font = getFont(settings.font);
  const visible = hasVisibleText(settings.text);
  const outlineWidth = `${(settings.outlineWidth * 0.012).toFixed(4)}em`;

  return (
    <main
      className="gobo-stage"
      data-panel={open ? "open" : "closed"}
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof Node && panelRef.current?.contains(target)) return;
        setPanel(true);
      }}
    >
      {visible ? (
        <div
          id="gobo"
          className="gobo-word"
          data-testid="gobo"
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
              fullscreen. It hides after 4 seconds of quiet, and every change is kept in this browser.
              Clear the text for a pure black frame.
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
