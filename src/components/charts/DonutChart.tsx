"use client";

/**
 * DonutChart — the circle/pie chart used for attendance splits and other
 * "parts of a whole" questions.
 *
 * Built from <circle> strokes rather than path arcs: a single 100% slice is
 * then just a full dash pattern, so no special-casing is needed for the
 * one-slice case. Hovering a segment (or its legend row) lifts it out of the
 * ring and swaps the centre label to that slice's name, count and share.
 *
 * A Client Component because of the hover state. Colours arrive as CSS custom
 * properties from palette.ts, so theming stays entirely in CSS.
 */

import { useState } from "react";
import { formatCount } from "./palette";

export type DonutSlice = {
  label: string;
  value: number;
  /** CSS color — normally a `var(--chart-*)` token. */
  color: string;
  /** Tailwind text color used for the hovered label in the centre. */
  textClass?: string;
};

export default function DonutChart({
  slices,
  centerLabel = "Total",
  centerHint,
  size = 220,
  thickness = 30,
  className = "",
}: {
  slices: DonutSlice[];
  /** Caption under the centre number when nothing is hovered. */
  centerLabel?: string;
  /** Extra line under the centre number (e.g. "students"). */
  centerHint?: string;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  // A 2-unit breathing gap between slices; skipped for slivers so a tiny
  // slice never disappears entirely.
  const gap = 2;

  // Arc geometry as pure maps: each slice's dash starts where the previous one
  // ended. Slices are few (one per status), so the prefix sum is cheap.
  const lengths = slices.map((slice) => {
    const value = Math.max(0, slice.value);
    return total ? (value / total) * circumference : 0;
  });
  const arcs = slices.map((slice, index) => {
    const length = lengths[index];
    const visible = length > 0 ? Math.max(length - (length > gap * 2 ? gap : 0), 0.5) : 0;
    const offset = lengths.slice(0, index).reduce((sum, entry) => sum + entry, 0);
    return {
      index,
      value: Math.max(0, slice.value),
      dash: `${visible} ${circumference - visible}`,
      shift: -offset,
      color: slice.color,
    };
  });

  const hovered = active === null ? null : slices[active];
  const hoveredValue = hovered ? Math.max(0, hovered.value) : 0;
  const hoveredShare = total ? Math.round((hoveredValue / total) * 100) : 0;
  const summary = `Total ${centerLabel}: ${formatCount(total)}. ${slices
    .filter((slice) => slice.value > 0)
    .map((slice) => `${slice.label} ${formatCount(slice.value)}`)
    .join(", ")}.`;
return (
    <div className={`flex flex-col items-center gap-6 sm:flex-row sm:items-center ${className}`}>
      <div className="relative shrink-0" style={{ width: size, maxWidth: "100%" }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="chart-enter h-auto w-full" role="img" aria-label={summary}>
          {/* Track: the empty remainder of the ring. */}
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--chart-muted)" strokeWidth={thickness} />
          <g transform={`rotate(-90 ${center} ${center})`}>
            {arcs.map((arc) =>
              arc.value <= 0 ? null : (
                <circle
                  key={arc.index}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={active === arc.index ? thickness + 7 : thickness}
                  strokeDasharray={arc.dash}
                  strokeDashoffset={arc.shift}
                  className="chart-arc"
                  opacity={active === null || active === arc.index ? 1 : 0.32}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setActive(arc.index)}
                  onMouseLeave={() => setActive(null)}
                />
              ),
            )}
          </g>
        </svg>

        {/* Centre read-out. aria-hidden because the <svg> label above already
            carries the same numbers for screen readers. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-8 text-center" aria-hidden="true">
          <div>
            <p className="text-3xl font-bold leading-none text-slate-900 sm:text-4xl">
              {formatCount(hovered ? hoveredValue : total)}
            </p>
            <p className={`mt-2 text-xs font-semibold ${hovered?.textClass ?? "text-slate-500"}`}>
              {hovered ? hovered.label : centerLabel}
            </p>
            {hovered ? (
              <p className="mt-1 text-xs font-medium text-slate-400">{hoveredShare}% of total</p>
            ) : centerHint ? (
              <p className="mt-1 text-xs text-slate-400">{centerHint}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Legend doubles as a second way to inspect a slice on touch devices,
          where there is no hover. */}
      <ul className="grid w-full gap-1.5 sm:w-auto sm:flex-1">
        {slices.map((slice, index) => {
          const share = total ? Math.round((Math.max(0, slice.value) / total) * 100) : 0;
          const isActive = active === index;
          return (
            <li key={slice.label}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-pressed={isActive}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${isActive ? "bg-slate-100" : "hover:bg-slate-50"}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{slice.label}</span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${isActive ? "text-slate-900" : "text-slate-500"}`}>
                  {formatCount(slice.value)}
                </span>
                <span className="w-11 shrink-0 text-right text-xs font-medium tabular-nums text-slate-400">{share}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}