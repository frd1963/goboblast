"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  ROOM,
  angleFromSpot,
  clampDistance,
  clampHeight,
  spotForAngle,
  type BeamSpot,
} from "@/lib/placement";
import {
  HORIZONTAL_MAX,
  HORIZONTAL_MIN,
  PROJECTOR_MAX,
  PROJECTOR_MIN,
  throwSpread,
  type ProjectorThrow,
} from "@/lib/projector";

type V3 = { x: number; y: number; z: number };
type DragMode = "projector" | "aim";

/**
 * One-point view of the room. The camera sits in front of the open side, a little
 * to the right, so the floor, back wall, ceiling, and both side walls all show.
 * World units match the side-view scales: Y is ROOM.height, Z is ROOM.width.
 */
const SCENE = {
  viewW: 312,
  viewH: 224,
  cx: 226,
  cy: 126,
  focal: 560,
  camX: 64,
  camY: 72,
  camZ: ROOM.width + 480,
  halfX: 118,
} as const;

function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul(a: V3, scale: number): V3 {
  return { x: a.x * scale, y: a.y * scale, z: a.z * scale };
}

function norm(v: V3): V3 {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 1e-6)) return { x: 0, y: 0, z: -1 };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function project(p: V3) {
  const depth = SCENE.camZ - p.z;
  const safe = Math.abs(depth) < 1 ? (depth < 0 ? -1 : 1) : depth;
  const u = (p.x - SCENE.camX) / safe;
  const v = (p.y - SCENE.camY) / safe;
  return { x: SCENE.cx + u * SCENE.focal, y: SCENE.cy - v * SCENE.focal };
}

function pointsOf(pts: V3[]) {
  return pts
    .map((point) => {
      const screen = project(point);
      return `${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
    })
    .join(" ");
}

function inRange(value: number, min: number, max: number, pad = 2) {
  return value >= min - pad && value <= max + pad;
}

/** First room face the ray meets: floor, ceiling, back wall, or either side wall. */
function hitRoom(origin: V3, dir: V3): V3 | null {
  const x = SCENE.halfX;
  const yMax = ROOM.height;
  const zMax = ROOM.width;
  let bestT = Infinity;
  let best: V3 | null = null;
  const consider = (axis: "x" | "y" | "z", value: number, inside: (point: V3) => boolean) => {
    const component = dir[axis];
    if (Math.abs(component) < 1e-8) return;
    const t = (value - origin[axis]) / component;
    if (t < 0.04 || t >= bestT) return;
    const point = add(origin, mul(dir, t));
    if (!inside(point)) return;
    bestT = t;
    best = point;
  };
  consider("y", 0, (point) => inRange(point.x, -x, x) && inRange(point.z, 0, zMax));
  consider("y", yMax, (point) => inRange(point.x, -x, x) && inRange(point.z, 0, zMax));
  consider("z", 0, (point) => inRange(point.x, -x, x) && inRange(point.y, 0, yMax));
  consider("x", -x, (point) => inRange(point.y, 0, yMax) && inRange(point.z, 0, zMax));
  consider("x", x, (point) => inRange(point.y, 0, yMax) && inRange(point.z, 0, zMax));
  return best;
}

function screenRay(sx: number, sy: number) {
  const u = (sx - SCENE.cx) / SCENE.focal;
  const v = (SCENE.cy - sy) / SCENE.focal;
  return { origin: { x: SCENE.camX, y: SCENE.camY, z: SCENE.camZ }, dir: norm({ x: u, y: v, z: -1 }) };
}

function hitPlaneX(origin: V3, dir: V3, x: number): V3 | null {
  if (Math.abs(dir.x) < 1e-6) return null;
  const t = (x - origin.x) / dir.x;
  if (!(t > 0)) return null;
  return add(origin, mul(dir, t));
}

/**
 * Beam direction in world pixels. Pitch uses the stored angle: positive aims down.
 * Yaw turns that beam to the right. A nearly vertical beam gets a small lean so the
 * yaw stays visible instead of collapsing onto the plumb line.
 */
function beamDirection(angleDeg: number, yawDeg: number): V3 {
  const pitch = (Math.min(PROJECTOR_MAX, Math.max(PROJECTOR_MIN, angleDeg)) * Math.PI) / 180;
  const yaw = (Math.min(HORIZONTAL_MAX, Math.max(HORIZONTAL_MIN, yawDeg)) * Math.PI) / 180;
  const cosPitch = Math.cos(pitch);
  const lean = Math.abs(cosPitch) < 0.18 ? 0.18 - Math.abs(cosPitch) : 0;
  const across = cosPitch + lean;
  return norm({
    x: Math.sin(yaw) * across,
    y: -Math.sin(pitch),
    z: -Math.cos(yaw) * across,
  });
}

function cast(origin: V3, dir: V3, fallback: number): V3 {
  return hitRoom(origin, dir) ?? add(origin, mul(norm(dir), fallback));
}

function beamPatch(origin: V3, dir: V3, spread: number, reach: number): V3[] {
  const forward = norm(dir);
  const upHint = Math.abs(forward.y) > 0.92 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = norm(cross(forward, upHint));
  const up = norm(cross(right, forward));
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([side, lift]) =>
    cast(origin, norm(add(forward, add(mul(right, side * spread), mul(up, lift * spread)))), reach),
  );
}

function sameSpot(a: BeamSpot, b: BeamSpot) {
  if (a.surface !== b.surface) return false;
  if (a.surface === "wall" && b.surface === "wall") return a.height === b.height;
  if (a.surface !== "wall" && b.surface !== "wall") return a.aim === b.aim;
  return false;
}

function roomFaces() {
  const x = SCENE.halfX;
  const y = ROOM.height;
  const z = ROOM.width;
  const corner = (cx: number, cy: number, cz: number): V3 => ({ x: cx, y: cy, z: cz });
  return [
    {
      name: "ceiling",
      fill: "#111827",
      stroke: "#475569",
      points: [corner(-x, y, 0), corner(x, y, 0), corner(x, y, z), corner(-x, y, z)],
    },
    {
      name: "wall",
      fill: "#1e293b",
      stroke: "#94a3b8",
      points: [corner(-x, 0, 0), corner(x, 0, 0), corner(x, y, 0), corner(-x, y, 0)],
    },
    {
      name: "left",
      fill: "#0c1322",
      stroke: "#334155",
      points: [corner(-x, 0, 0), corner(-x, 0, z), corner(-x, y, z), corner(-x, y, 0)],
    },
    {
      name: "right",
      fill: "#162033",
      stroke: "#334155",
      points: [corner(x, 0, 0), corner(x, 0, z), corner(x, y, z), corner(x, y, 0)],
    },
    {
      name: "floor",
      fill: "#0b1220",
      stroke: "#94a3b8",
      points: [corner(-x, 0, 0), corner(x, 0, 0), corner(x, 0, z), corner(-x, 0, z)],
    },
  ];
}

function floorLines() {
  const x = SCENE.halfX;
  const z = ROOM.width;
  const lines: V3[][] = [];
  for (const step of [0.25, 0.5, 0.75]) {
    lines.push([
      { x: -x, y: 0, z: z * step },
      { x, y: 0, z: z * step },
    ]);
    lines.push([
      { x: -x + 2 * x * step, y: 0, z: 0 },
      { x: -x + 2 * x * step, y: 0, z },
    ]);
  }
  return lines;
}

export function ProjectorDial({
  distance,
  height,
  spot,
  angle,
  horizontalAngle,
  throwKind,
  onPosition,
  onSpot,
  onAngle,
}: {
  distance: number;
  height: number;
  spot: BeamSpot;
  angle: number;
  horizontalAngle: number;
  throwKind: ProjectorThrow;
  onPosition: (distance: number, height: number) => void;
  onSpot: (spot: BeamSpot, horizontalAngle: number) => void;
  onAngle: (angle: number) => void;
}) {
  const mode = useRef<DragMode | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const origin: V3 = { x: 0, y: height * ROOM.height, z: distance * ROOM.width };
  const direction = beamDirection(angle, horizontalAngle);
  const reach = Math.hypot(ROOM.width, ROOM.height);
  const hit = cast(origin, direction, reach);
  const patch = beamPatch(origin, direction, throwSpread(throwKind), reach);
  const lens = project(origin);
  const spotAt = project(hit);
  const shown = Math.round(angle);
  const yawShown = Math.round(horizontalAngle);
  const beamAngle = (Math.atan2(spotAt.y - lens.y, spotAt.x - lens.x) * 180) / Math.PI;
  const foot: V3 = { x: 0, y: 0, z: origin.z };
  const yaw = (yawShown * Math.PI) / 180;
  const heading: V3 = {
    x: Math.sin(yaw) * 46,
    y: 0,
    z: origin.z - Math.cos(yaw) * 46,
  };
  const forward: V3 = { x: 0, y: origin.y, z: origin.z - 34 };

  function viewPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * SCENE.viewW,
      y: ((event.clientY - rect.top) / rect.height) * SCENE.viewH,
    };
  }

  function chooseMode(point: { x: number; y: number }): DragMode | null {
    if (Math.hypot(point.x - spotAt.x, point.y - spotAt.y) <= 20) return "aim";
    if (Math.hypot(point.x - lens.x, point.y - lens.y) <= 28) return "projector";
    const ray = screenRay(point.x, point.y);
    if (hitRoom(ray.origin, ray.dir)) return "aim";
    return null;
  }

  function apply(event: PointerEvent<HTMLDivElement>) {
    const dragging = mode.current;
    if (!dragging) return;
    const point = viewPoint(event);
    if (!point) return;
    const ray = screenRay(point.x, point.y);
    if (dragging === "projector") {
      const next = hitPlaneX(ray.origin, ray.dir, 0);
      if (!next) return;
      const nextDistance = clampDistance(next.z / ROOM.width);
      const nextHeight = clampHeight(next.y / ROOM.height);
      if (nextDistance === distance && nextHeight === height) return;
      onPosition(nextDistance, nextHeight);
      return;
    }
    const landed = hitRoom(ray.origin, ray.dir);
    if (!landed) return;
    const vx = landed.x - origin.x;
    const vy = landed.y - origin.y;
    const vz = landed.z - origin.z;
    const horiz = Math.hypot(vx, vz);
    let nextYaw = yawShown;
    if (horiz > 8) nextYaw = Math.round((Math.atan2(vx, -vz) * 180) / Math.PI);
    nextYaw = Math.min(HORIZONTAL_MAX, Math.max(HORIZONTAL_MIN, nextYaw));
    const pitch = (Math.atan2(-vy, Math.max(horiz, 0.001)) * 180) / Math.PI;
    const placed = spotForAngle(distance, height, pitch, vz <= 4);
    if (sameSpot(placed.spot, spot) && nextYaw === yawShown) return;
    onSpot(placed.spot, nextYaw);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = shown + step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = shown - step;
    else if (event.key === "Home") next = PROJECTOR_MIN;
    else if (event.key === "End") next = PROJECTOR_MAX;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onAngle(Math.min(PROJECTOR_MAX, Math.max(PROJECTOR_MIN, next)));
  }

  const pitchArc =
    Math.abs(shown) > 2
      ? Array.from({ length: 9 }, (_, index) => {
          const step = ((shown * index) / 8) * (Math.PI / 180);
          return project({
            x: origin.x,
            y: origin.y - Math.sin(step) * 30,
            z: origin.z - Math.cos(step) * 30,
          });
        })
          .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
          .join(" ")
      : "";

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
        viewBox={`0 0 ${SCENE.viewW} ${SCENE.viewH}`}
        role="slider"
        aria-label="Room diagram. Drag the projector to place it. Drag the spot to aim up, down, left, and right. 90 degrees is straight down onto the floor. 0 degrees is level into the wall. Negative angles aim up."
        aria-valuemin={PROJECTOR_MIN}
        aria-valuemax={PROJECTOR_MAX}
        aria-valuenow={shown}
        aria-valuetext={`${shown} degrees vertical, ${yawShown} degrees horizontal`}
        data-distance={distance}
        data-height={height}
        data-spot={spot.surface}
        data-aim={spot.surface === "wall" ? 0 : spot.aim}
        data-spot-height={spot.surface === "wall" ? spot.height : 0}
        data-angle={angleFromSpot(distance, height, spot)}
        data-horizontal={horizontalAngle}
        data-room="3d"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <rect width={SCENE.viewW} height={SCENE.viewH} rx="8" fill="#020617" />
        {roomFaces().map((face) => (
          <polygon
            key={face.name}
            data-face={face.name}
            points={pointsOf(face.points)}
            fill={face.fill}
            stroke={face.stroke}
            strokeWidth={face.name === "left" || face.name === "right" ? 1 : 1.6}
            strokeLinejoin="miter"
          />
        ))}
        {floorLines().map((line, index) => (
          <polyline
            key={index}
            points={pointsOf(line)}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1"
          />
        ))}
        <text
          x={project({ x: -SCENE.halfX * 0.42, y: ROOM.height * 0.72, z: 2 }).x}
          y={project({ x: -SCENE.halfX * 0.42, y: ROOM.height * 0.72, z: 2 }).y}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
        >
          Wall
        </text>
        <text
          x={project({ x: 0, y: ROOM.height - 2, z: ROOM.width * 0.46 }).x}
          y={project({ x: 0, y: ROOM.height - 2, z: ROOM.width * 0.46 }).y}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
        >
          Ceiling
        </text>
        <text
          x={project({ x: 8, y: 2, z: ROOM.width * 0.72 }).x}
          y={project({ x: 8, y: 2, z: ROOM.width * 0.72 }).y}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
        >
          Floor
        </text>
        <text
          x={project({ x: -SCENE.halfX + 16, y: 10, z: ROOM.width * 0.62 }).x}
          y={project({ x: -SCENE.halfX + 16, y: 10, z: ROOM.width * 0.62 }).y}
          textAnchor="middle"
          fill="#64748b"
          fontSize="10"
        >
          L
        </text>
        <text
          x={project({ x: SCENE.halfX - 16, y: 10, z: ROOM.width * 0.62 }).x}
          y={project({ x: SCENE.halfX - 16, y: 10, z: ROOM.width * 0.62 }).y}
          textAnchor="middle"
          fill="#64748b"
          fontSize="10"
        >
          R
        </text>

        <line
          x1={lens.x}
          y1={lens.y}
          x2={project(foot).x}
          y2={project(foot).y}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <line
          x1={lens.x}
          y1={lens.y}
          x2={project(forward).x}
          y2={project(forward).y}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <line
          x1={project(foot).x}
          y1={project(foot).y}
          x2={project(heading).x}
          y2={project(heading).y}
          stroke="#818cf8"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {pitchArc ? (
          <polyline points={pitchArc} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
        ) : null}

        <polygon points={pointsOf(patch)} data-throw={throwKind} fill="rgba(248, 250, 252, 0.2)" />
        <line
          x1={lens.x}
          y1={lens.y}
          x2={spotAt.x}
          y2={spotAt.y}
          stroke="#f8fafc"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx={spotAt.x} cy={spotAt.y} r="6" fill="#f8fafc" stroke="#6366f1" strokeWidth="2" />

        <g transform={`translate(${lens.x} ${lens.y}) rotate(${beamAngle})`}>
          <rect x={-32} y={-9} width={20} height={18} rx={3} fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x={-13} y={-5} width={10} height={10} rx={2} fill="#e2e8f0" />
          <circle cx={0} cy={0} r={2.8} fill="#6366f1" />
        </g>
        <circle cx={lens.x} cy={lens.y} r={2} fill="#020617" />

        <text x={SCENE.viewW - 10} y={18} textAnchor="end" fill="#c7d2fe" fontSize="16" fontWeight="700">
          {shown}°
        </text>
        <text x={SCENE.viewW - 10} y={34} textAnchor="end" fill="#a5b4fc" fontSize="12">
          {yawShown}° yaw
        </text>
      </svg>
    </div>
  );
}
