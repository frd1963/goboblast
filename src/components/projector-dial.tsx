"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

const VIEW_W = 300;
const VIEW_H = 220;

/**
 * Vertical wall on the left. The beam uses the floor throw: 90° runs straight into
 * the wall, and lower angles meet it further down. The throw is short enough that
 * a 30° beam lands on the wall with wall still showing below the hit.
 */
const WALL_X = 86;
const WALL_Y0 = 20;
const WALL_Y1 = 204;
const LENS = { x: 142, y: 46 };
const BOTTOM = 204;

type Point = { x: number; y: number };

function clampAngle(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(90, Math.max(0, value)));
}

function directionFor(angle: number): Point {
  const rad = (angle * Math.PI) / 180;
  return { x: -Math.sin(rad), y: Math.cos(rad) };
}

function rayEnd(origin: Point, direction: Point) {
  let t = Number.POSITIVE_INFINITY;
  if (direction.x < -0.0001) t = Math.min(t, (WALL_X - origin.x) / direction.x);
  if (direction.y > 0.0001) t = Math.min(t, (BOTTOM - origin.y) / direction.y);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
}

function arcPath(angle: number) {
  const radius = 30;
  const start = (90 * Math.PI) / 180;
  const end = ((90 + angle) * Math.PI) / 180;
  const x1 = LENS.x + radius * Math.cos(start);
  const y1 = LENS.y + radius * Math.sin(start);
  const x2 = LENS.x + radius * Math.cos(end);
  const y2 = LENS.y + radius * Math.sin(end);
  const large = angle > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function conePoints(hit: Point, direction: Point, half: number) {
  const length = Math.hypot(direction.x, direction.y) || 1;
  const px = (-direction.y / length) * half;
  const py = (direction.x / length) * half;
  return `${LENS.x},${LENS.y} ${hit.x + px},${hit.y + py} ${hit.x - px},${hit.y - py}`;
}

export function ProjectorDial({
  angle,
  onChange,
}: {
  angle: number;
  onChange: (angle: number) => void;
}) {
  const dragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const shown = clampAngle(angle);
  const direction = directionFor(shown);
  const hit = rayEnd(LENS, direction);
  const arc = shown > 0.5 ? arcPath(shown) : "";

  function readAngle(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return shown;
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    const dx = x - LENS.x;
    const dy = y - LENS.y;
    return clampAngle((Math.atan2(-dx, dy) * 180) / Math.PI);
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

  return (
    <div
      className="gobo-dial"
      onPointerDown={(event) => {
        dragging.current = true;
        apply(event);
        svgRef.current?.focus({ preventScroll: true });
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
        aria-label="Projector angle. 90 degrees faces the wall straight on. Lower angles hit it more obliquely."
        aria-valuemin={0}
        aria-valuemax={90}
        aria-valuenow={shown}
        aria-valuetext={`${shown} degrees`}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <rect width={VIEW_W} height={VIEW_H} rx="8" fill="#020617" />
        <rect
          x={16}
          y={WALL_Y0}
          width={WALL_X - 16}
          height={WALL_Y1 - WALL_Y0}
          rx={2}
          fill="#0f172a"
          stroke="#334155"
        />
        <line
          x1={WALL_X}
          y1={WALL_Y0}
          x2={WALL_X}
          y2={WALL_Y1}
          stroke="#94a3b8"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1={LENS.x}
          y1={LENS.y}
          x2={WALL_X}
          y2={LENS.y}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <line
          x1={LENS.x}
          y1={LENS.y}
          x2={LENS.x}
          y2={BOTTOM}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text
          x={(16 + WALL_X) / 2}
          y={(WALL_Y0 + WALL_Y1) / 2}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
          transform={`rotate(-90 ${(16 + WALL_X) / 2} ${(WALL_Y0 + WALL_Y1) / 2})`}
        >
          Wall
        </text>

        <polygon points={conePoints(hit, direction, 12)} fill="rgba(248, 250, 252, 0.16)" />
        <line
          x1={LENS.x}
          y1={LENS.y}
          x2={hit.x}
          y2={hit.y}
          stroke="#f8fafc"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {arc ? <path d={arc} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" /> : null}
        <circle cx={hit.x} cy={hit.y} r="5" fill="#f8fafc" stroke="#6366f1" strokeWidth="2" />

        <g transform={`translate(${LENS.x} ${LENS.y}) rotate(${90 + shown})`}>
          <rect x={-36} y={-11} width={26} height={22} rx={4} fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x={-12} y={-6} width={12} height={12} rx={2} fill="#e2e8f0" />
          <circle cx={0} cy={0} r={3.2} fill="#6366f1" />
        </g>
        <circle cx={LENS.x} cy={LENS.y} r={2} fill="#020617" />

        <text x={VIEW_W - 12} y={22} textAnchor="end" fill="#c7d2fe" fontSize="16" fontWeight="700">
          {shown}°
        </text>
      </svg>
    </div>
  );
}
