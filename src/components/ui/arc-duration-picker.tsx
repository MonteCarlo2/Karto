"use client";

import React, { useRef, useCallback } from "react";

type ArcDurationPickerProps = {
  value: "5s" | "10s";
  onChange: (v: "5s" | "10s") => void;
};

// Arc geometry (constants)
const W = 64, H = 40;
const cx = 32, cy = 40, r = 26;

// 5s = angle 205°, 10s = angle 335° (clockwise from right in SVG)
function pt(deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

const p5s = pt(205);   // left endpoint  ~{8.8, 29.0}
const p10s = pt(335);  // right endpoint ~{55.2, 29.0}

// Arc path: from 5s → through top (270°) → 10s, sweep=1 (clockwise in SVG = goes upward)
const TRACK = `M ${p5s.x.toFixed(2)} ${p5s.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p10s.x.toFixed(2)} ${p10s.y.toFixed(2)}`;

export function ArcDurationPicker({ value, onChange }: ArcDurationPickerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  const resolveValue = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const svgX = ((clientX - rect.left) / rect.width) * W;
      onChange(svgX < W / 2 ? "5s" : "10s");
    },
    [onChange]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    resolveValue(e.clientX);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) resolveValue(e.clientX);
  };
  const onMouseUp = () => { isDragging.current = false; };

  const onTouchStart = (e: React.TouchEvent) => resolveValue(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => resolveValue(e.touches[0].clientX);

  const handle = value === "5s" ? p5s : p10s;

  return (
    <svg
      ref={svgRef}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ cursor: "ew-resize", display: "block", overflow: "visible", userSelect: "none" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {/* Track */}
      <path
        d={TRACK}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Filled arc (when 10s — whole arc is active) */}
      {value === "10s" && (
        <path
          d={TRACK}
          fill="none"
          stroke="#111"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      )}

      {/* Filled arc stub at 5s position */}
      {value === "5s" && (
        <circle cx={p5s.x} cy={p5s.y} r="2" fill="#111" />
      )}

      {/* Handle outer ring */}
      <circle cx={handle.x} cy={handle.y} r="7" fill="#111" />
      {/* Handle inner dot */}
      <circle cx={handle.x} cy={handle.y} r="4" fill="white" />

      {/* Center value label */}
      <text
        x={cx}
        y={22}
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="#111"
      >
        {value}
      </text>

      {/* Small endpoint labels */}
      <text
        x={p5s.x + 1}
        y={p5s.y + 10}
        textAnchor="middle"
        fontSize="7"
        fill="#9CA3AF"
        fontFamily="system-ui"
      >
        5
      </text>
      <text
        x={p10s.x - 1}
        y={p10s.y + 10}
        textAnchor="middle"
        fontSize="7"
        fill="#9CA3AF"
        fontFamily="system-ui"
      >
        10
      </text>
    </svg>
  );
}
