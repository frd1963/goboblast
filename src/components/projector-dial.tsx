"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

const VIEW_W = 300;
const VIEW_H = 148;

const FLOOR = {
  lensX: 70,
  lensY: 36,
  surfaceY: 126,
  surfaceX0: 16,
  surfaceX1: 284,
};

const WALL = {
  lensX: 132,
  lensY: 100,
  surfaceX: 22,
  surfaceY0: 14,
  surfaceY1: 132,
};

type Point = { x: number; y: number };

function clampAngle(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(90, Math.max(0, value)));
}

function rayEnd(origin: Point, direction: Point, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
  let t = Number.POSITIVE_INFINITY;
  if (direction.x > 0.0001) t = Math.min(t, (bounds.maxX - origin.x) / direction.x);
  if (direction.x < -0.0001) t = Math.min(t, (bounds.minX - origin.x) / direction.x);
  if (direction.y > 0.0001) t = Math.min(t, (bounds.maxY - origin.y) / direction.y);
  if (direction.y < -0.0001) t = Math.min(t, (bounds.minY - origin.y) / direction.y);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
}

function scene(surface: "floor" | "wall", angle: number) {
  const rad = (clampAngle(angle) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  if (surface === "floor") {
    const lens = { x: FLOOR.lensX, y: FLOOR.lensY };
    const direction = { x: cos, y: sin };
    const hit = rayEnd(lens, direction, {
      minX: FLOOR.surfaceX0,
      maxX: FLOOR.surfaceX1,
      minY: FLOOR.lensY,
      maxY: FLOOR.surfaceY,
    });
    return {
      lens,
      hit,
      direction,
      rotation: angle,
      arcStart: 0,
      arcEnd: angle,
      sweep: 1,
    };
  }
  const lens = { x: WALL.lensX, y: WALL.lensY };
  const direction = { x: -cos, y: -sin };
  const hit = rayEnd(lens, direction, {
    minX: WALL.surfaceX,
    maxX: WALL.lensX,
    minY: WALL.surfaceY0,
    maxY: WALL.lensY,
  });
  return {
    lens,
    hit,
    direction,
    rotation: 180 - angle,
    arcStart: 180,
    arcEnd: 180 - angle,
    sweep: 0,
  };
}

function arcPath(cx: number, cy: number, radius: number, startDeg: number, endDeg: number, sweep: number) {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };
  const [x1, y1] = point(startDeg);
  const [x2, y2] = point(endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function conePoints(lens: Point, hit: Point, direction: Point, half: number) {
  const length = Math.hypot(direction.x, direction.y) || 1;
  const px = (-direction.y / length) * half;
  const py = (direction.x / length) * half;
  return `${lens.x},${lens.y} ${hit.x + px},${hit.y + py} ${hit.x - px},${hit.y - py}`;
}

export function ProjectorDial({
  surface,
  angle,
  onChange,
}: {
  surface: "floor" | "wall";
  angle: number;
  onChange: (angle: number) => void;
}) {
  const dragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const shown = clampAngle(angle);
  const { lens, hit, direction, rotation, arcStart, arcEnd, sweep } = scene(surface, shown);
  const arc =
    shown > 0.5 ? arcPath(lens.x, lens.y, 32, arcStart, arcEnd, sweep) : "";

  function readAngle(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return shown;
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    if (surface === "floor") {
      return clampAngle((Math.atan2(y - lens.y, x - lens.x) * 180) / Math.PI);
    }
    return clampAngle((Math.atan2(lens.y - y, lens.x - x) * 180) / Math.PI);
  }

  function apply(event: PointerEvent<HTMLDivElement>) {
    const next = readAngle(event);
    if (next !== shown) onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = shown + step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = shown - step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 90;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(clampAngle(next));
  }

  const aim =
    surface === "floor"
      ? "Projector angle on the floor. 0° is horizontal, 90° points straight down."
      : "Projector angle on the wall. 0° aims straight at the wall, 90° pitches up.";

  return (
    <div
      className="gobo-dial"
      onPointerDown={(event) => {
        dragging.current = true;
        svgRef.current?.focus();
        apply(event);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer that cannot be captured still sets the angle from this event.
        }
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        apply(event);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Released already, or this pointer never captured.
        }
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
    <svg
      ref={svgRef}
      className="gobo-dial-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="slider"
      aria-label={aim}
      aria-valuemin={0}
      aria-valuemax={90}
      aria-valuenow={shown}
      aria-valuetext={`${shown} degrees`}
      tabIndex={0}
      data-surface={surface}
      onKeyDown={onKeyDown}
    >
      <rect width={VIEW_W} height={VIEW_H} rx="8" fill="#020617" />
      {surface === "floor" ? (
        <>
          <line
            x1={FLOOR.surfaceX0}
            y1={FLOOR.surfaceY}
            x2={FLOOR.surfaceX1}
            y2={FLOOR.surfaceY}
            stroke="#64748b"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1={lens.x}
            y1={lens.y}
            x2={FLOOR.surfaceX1}
            y2={lens.y}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <line
            x1={lens.x}
            y1={lens.y}
            x2={lens.x}
            y2={FLOOR.surfaceY}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <text x={FLOOR.surfaceX0} y={FLOOR.surfaceY + 14} fill="#64748b" fontSize="10">
            Floor
          </text>
        </>
      ) : (
        <>
          <line
            x1={WALL.surfaceX}
            y1={WALL.surfaceY0}
            x2={WALL.surfaceX}
            y2={WALL.surfaceY1}
            stroke="#64748b"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1={lens.x}
            y1={lens.y}
            x2={WALL.surfaceX}
            y2={lens.y}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <line
            x1={lens.x}
            y1={lens.y}
            x2={lens.x}
            y2={WALL.surfaceY0}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <text x={WALL.surfaceX + 8} y={WALL.surfaceY1 + 12} fill="#64748b" fontSize="10">
            Wall
          </text>
        </>
      )}

      <polygon points={conePoints(lens, hit, direction, 12)} fill="rgba(248, 250, 252, 0.16)" />
      <line
        x1={lens.x}
        y1={lens.y}
        x2={hit.x}
        y2={hit.y}
        stroke="#f8fafc"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {arc ? <path d={arc} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" /> : null}
      <circle cx={hit.x} cy={hit.y} r="5" fill="#f8fafc" stroke="#6366f1" strokeWidth="2" />

      <g transform={`translate(${lens.x} ${lens.y}) rotate(${rotation})`}>
        <rect x={-36} y={-11} width={26} height={22} rx={4} fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.5" />
        <rect x={-12} y={-6} width={12} height={12} rx={2} fill="#e2e8f0" />
        <circle cx={0} cy={0} r={3.2} fill="#6366f1" />
      </g>
      <circle cx={lens.x} cy={lens.y} r={2} fill="#020617" />

      <text x={VIEW_W - 12} y={22} textAnchor="end" fill="#c7d2fe" fontSize="16" fontWeight="700">
        {shown}°
      </text>
    </svg>
    </div>
  );
}
