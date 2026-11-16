"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  ROOM,
  angleFromSpot,
  clampAim,
  clampDistance,
  clampHeight,
  type BeamSpot,
} from "@/lib/placement";

type Point = { x: number; y: number };
type DragMode = "projector" | "aim";

function lensPoint(distance: number, height: number): Point {
  return {
    x: ROOM.wallFace + distance * ROOM.width,
    y: ROOM.floorFace - height * ROOM.height,
  };
}

function spotPoint(spot: BeamSpot): Point {
  if (spot.surface === "wall") {
    return { x: ROOM.wallFace, y: ROOM.floorFace - spot.height * ROOM.height };
  }
  return { x: ROOM.wallFace + spot.aim * ROOM.width, y: ROOM.floorFace };
}

function spotFromPointer(point: Point, projectorHeight: number): BeamSpot {
  const aboveFloor = point.y < ROOM.floorFace - 6;
  const towardWall = point.x <= ROOM.wallFace + 20;
  if (aboveFloor && towardWall) {
    const ceiling = ROOM.floorFace - projectorHeight * ROOM.height;
    const y = Math.min(ROOM.floorFace, Math.max(ceiling, point.y));
    const spotHeight = Math.round(((ROOM.floorFace - y) / ROOM.height) * 1000) / 1000;
    if (spotHeight <= 0.01) return { surface: "floor", aim: 0 };
    return { surface: "wall", height: spotHeight };
  }
  return { surface: "floor", aim: clampAim((point.x - ROOM.wallFace) / ROOM.width) };
}

function beamDegrees(from: Point, to: Point) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function arcPath(origin: Point, fromDeg: number, toDeg: number, radius: number) {
  const start = (fromDeg * Math.PI) / 180;
  const end = (toDeg * Math.PI) / 180;
  const x1 = origin.x + radius * Math.cos(start);
  const y1 = origin.y + radius * Math.sin(start);
  const x2 = origin.x + radius * Math.cos(end);
  const y2 = origin.y + radius * Math.sin(end);
  const span = Math.abs(toDeg - fromDeg);
  const large = span > 180 ? 1 : 0;
  const sweep = toDeg > fromDeg ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function conePoints(from: Point, to: Point, half: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = (-dy / length) * half;
  const py = (dx / length) * half;
  return `${from.x},${from.y} ${to.x + px},${to.y + py} ${to.x - px},${to.y - py}`;
}

export function ProjectorDial({
  distance,
  height,
  spot,
  angle,
  onPosition,
  onSpot,
  onAngle,
}: {
  distance: number;
  height: number;
  spot: BeamSpot;
  angle: number;
  onPosition: (distance: number, height: number) => void;
  onSpot: (spot: BeamSpot) => void;
  onAngle: (angle: number) => void;
}) {
  const mode = useRef<DragMode | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lens = lensPoint(distance, height);
  const spotAt = spotPoint(spot);
  const rotation = beamDegrees(lens, spotAt);
  const shown = Math.round(angle);
  const horizontal = spotAt.x < lens.x ? 180 : 0;
  const span = Math.abs(rotation - horizontal);
  const arc = span > 2 && span < 88 ? arcPath(lens, horizontal, rotation, 24) : "";

  function viewPoint(event: PointerEvent<HTMLDivElement>): Point | null {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * ROOM.viewW,
      y: ((event.clientY - rect.top) / rect.height) * ROOM.viewH,
    };
  }

  function chooseMode(point: Point): DragMode | null {
    if (Math.hypot(point.x - spotAt.x, point.y - spotAt.y) <= 16) return "aim";
    if (Math.hypot(point.x - lens.x, point.y - lens.y) <= 26) return "projector";
    const onFloor =
      point.y >= ROOM.floorFace - 12 &&
      point.y <= ROOM.floorFace + 16 &&
      point.x >= ROOM.wallFace - 8 &&
      point.x <= ROOM.roomRight;
    if (onFloor) return "aim";
    const onWall =
      point.x <= ROOM.wallFace + 20 &&
      point.x >= 8 &&
      point.y >= ROOM.roomTop &&
      point.y <= ROOM.floorFace;
    if (onWall) return "aim";
    const inRoom =
      point.x >= ROOM.wallFace &&
      point.x <= ROOM.roomRight &&
      point.y >= ROOM.roomTop &&
      point.y <= ROOM.floorFace;
    if (inRoom) return "projector";
    return null;
  }

  function apply(event: PointerEvent<HTMLDivElement>) {
    const dragging = mode.current;
    if (!dragging) return;
    const point = viewPoint(event);
    if (!point) return;
    if (dragging === "projector") {
      const nextDistance = clampDistance((point.x - ROOM.wallFace) / ROOM.width);
      const nextHeight = clampHeight((ROOM.floorFace - point.y) / ROOM.height);
      if (nextDistance === distance && nextHeight === height) return;
      onPosition(nextDistance, nextHeight);
      return;
    }
    const next = spotFromPointer(point, height);
    if (next.surface === spot.surface) {
      if (next.surface === "floor" && spot.surface === "floor" && next.aim === spot.aim) return;
      if (next.surface === "wall" && spot.surface === "wall" && next.height === spot.height) return;
    }
    onSpot(next);
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
    onAngle(Math.min(90, Math.max(0, next)));
  }

  return (
    <div
      className="gobo-dial"
      onPointerDown={(event) => {
        const point = viewPoint(event);
        if (!point) return;
        const next = chooseMode(point);
        if (!next) return;
        mode.current = next;
        apply(event);
        svgRef.current?.focus({ preventScroll: true });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer that cannot be captured still sets the pose from this event.
        }
      }}
      onPointerMove={(event) => {
        if (!mode.current) return;
        apply(event);
      }}
      onPointerUp={(event) => {
        mode.current = null;
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Released already, or this pointer never captured.
        }
      }}
      onPointerCancel={() => {
        mode.current = null;
      }}
    >
      <svg
        ref={svgRef}
        className="gobo-dial-svg"
        viewBox={`0 0 ${ROOM.viewW} ${ROOM.viewH}`}
        role="slider"
        aria-label="Projector angle. 90 degrees is straight down onto the floor. A beam that is too shallow to reach the floor hits the wall. Drag the projector to move it, or the spot to aim."
        aria-valuemin={0}
        aria-valuemax={90}
        aria-valuenow={shown}
        aria-valuetext={`${shown} degrees`}
        data-distance={distance}
        data-height={height}
        data-spot={spot.surface}
        data-aim={spot.surface === "floor" ? spot.aim : 0}
        data-spot-height={spot.surface === "wall" ? spot.height : 0}
        data-angle={angleFromSpot(distance, height, spot)}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <rect width={ROOM.viewW} height={ROOM.viewH} rx="8" fill="#020617" />
        <path
          d={`M10 22 H${ROOM.wallFace} V${ROOM.floorFace} H${ROOM.roomRight} V188 H10 Z`}
          fill="#0f172a"
          stroke="#334155"
        />
        <path
          d={`M${ROOM.wallFace} 22 V${ROOM.floorFace} H${ROOM.roomRight}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2.5"
          strokeLinejoin="miter"
        />
        <path
          d={`M${ROOM.wallFace} ${ROOM.roomTop} H${ROOM.roomRight} V${ROOM.floorFace}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth="1.5"
        />
        <text
          x={23}
          y={96}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
          transform="rotate(-90 23 96)"
        >
          Wall
        </text>
        <text x={214} y={184} textAnchor="middle" fill="#94a3b8" fontSize="11">
          Floor
        </text>

        <line
          x1={lens.x}
          y1={lens.y}
          x2={lens.x}
          y2={ROOM.floorFace}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <line
          x1={lens.x}
          y1={lens.y}
          x2={lens.x + (spotAt.x < lens.x ? -18 : 18)}
          y2={lens.y}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3 4"
        />

        <polygon points={conePoints(lens, spotAt, 11)} fill="rgba(248, 250, 252, 0.16)" />
        <line
          x1={lens.x}
          y1={lens.y}
          x2={spotAt.x}
          y2={spotAt.y}
          stroke="#f8fafc"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {arc ? <path d={arc} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" /> : null}
        <circle cx={spotAt.x} cy={spotAt.y} r="6" fill="#f8fafc" stroke="#6366f1" strokeWidth="2" />

        <g transform={`translate(${lens.x} ${lens.y}) rotate(${rotation})`}>
          <rect x={-32} y={-9} width={20} height={18} rx={3} fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x={-13} y={-5} width={10} height={10} rx={2} fill="#e2e8f0" />
          <circle cx={0} cy={0} r={2.8} fill="#6366f1" />
        </g>
        <circle cx={lens.x} cy={lens.y} r={2} fill="#020617" />

        <text x={ROOM.viewW - 12} y={16} textAnchor="end" fill="#c7d2fe" fontSize="16" fontWeight="700">
          {shown}°
        </text>
      </svg>
    </div>
  );
}
