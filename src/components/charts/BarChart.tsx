"use client";

/**
 * BarChart — vertical bars, optionally grouped (one bar per series per
 * category). Used for per-class rollups, monthly fee collection and any other
 * "compare categories" question.
 *
 * The plot is a fixed viewBox that scales with the panel, so there is no
 * ResizeObserver and no layout thrash. Hovering a bar (or its legend row)
 * lifts it and prints a tooltip with every series for that category.
 *
 * A Client Component because of the hover state. Values are printed through a
 * named `valueFormat` rather than a formatter function, because React cannot
 * pass a function from a Server Component to a Client Component.
 */

import { useState } from "react";
import { formatByKind, niceCeiling, type ValueFormat } from "./palette";

export type BarSeries = {
  key: string;
  label: string;
  color: string;
};

export type BarDatum = {
  /** Category label shown under the group. */
  label: string;
  /** One value per series, in the same order as `series`. */
  values: number[];
  /** Extra lines for the tooltip (e.g. "34 of 40 students"). */
  hint?: string;
};

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 260;
const PADDING = { top: 18, right: 12, bottom: 40, left: 44 };
export default function BarChart({
  data,
  series,
  valueFormat = "count",
  unit = "",
  className = "",
}: {
  data: BarDatum[];
  series: BarSeries[];
  /** Names the formatter; charts are client components, so a function prop is not an option. */
  valueFormat?: ValueFormat;
  /** Suffix appended to axis ticks only (e.g. "%"). */
  unit?: string;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const formatValue = (value: number) => formatByKind(value, valueFormat);
  // Callers already render an EmptyChart for "no rows", but a chart that can
  // only crash is a bad contract — return a plain frame instead.
  if (data.length === 0) return <div className={className} />;

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const rawMax = data.reduce((max, datum) => Math.max(max, ...datum.values), 0);
  const axisMax = niceCeiling(rawMax);

  const slot = plotWidth / Math.max(data.length, 1);
  const groupWidth = Math.min(slot * 0.68, 74);
  const barGap = 4;
  const barWidth = Math.max((groupWidth - barGap * (series.length - 1)) / Math.max(series.length, 1), 4);
  const scale = (value: number) => (axisMax ? (value / axisMax) * plotHeight : 0);

  // 30 daily labels printed side by side collide into unreadable mush. Show as
  // many as have room (~64px of axis per label), always from the first bucket,
  // and keep the last one only when it lands clear of the previous showing.
  const labelStep = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(VIEW_WIDTH / 64))));
  const lastRemainder = (data.length - 1) % labelStep;
  const showLast = lastRemainder !== 0 && lastRemainder * slot >= 56;

  // Tallest bar in the hovered group, so the tooltip can sit above it.
  const activeTop = active === null ? PADDING.top : PADDING.top + plotHeight - scale(Math.max(...data[active].values));

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="h-auto w-full" role="img" aria-label="Bar chart">
        {/* Horizontal gridlines + y-axis ticks. */}
        {Array.from({ length: GRID_LINES + 1 }, (_, index) => {
          const ratio = index / GRID_LINES;
          const y = PADDING.top + plotHeight - ratio * plotHeight;
          return (
            <g key={index}>
              <line
                x1={PADDING.left}
                x2={VIEW_WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke="var(--chart-grid)"
                strokeWidth={index === 0 ? 1.5 : 1}
                strokeDasharray={index === 0 ? undefined : "4 6"}
              />
              <text
                x={PADDING.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={12}
                fill="var(--chart-axis)"
              >
                {formatValue(axisMax * ratio)}
              </text>
            </g>
          );
        })}

        {data.map((datum, groupIndex) => {
          const groupLeft = PADDING.left + slot * groupIndex + (slot - groupWidth) / 2;
          return (
            <g
              key={datum.label}
              onMouseEnter={() => setActive(groupIndex)}
              onMouseLeave={() => setActive(null)}
            >
              {/* Transparent hit area — the bars themselves are thin. */}
              <rect
                x={PADDING.left + slot * groupIndex}
                y={PADDING.top}
                width={slot}
                height={plotHeight}
                fill={active === groupIndex ? "var(--chart-muted)" : "transparent"}
                opacity={active === groupIndex ? 0.5 : 0}
                rx={10}
              />
              {datum.values.map((value, seriesIndex) => {
                const height = scale(Math.max(0, value));
                if (height <= 0) return null;
                const x = groupLeft + seriesIndex * (barWidth + barGap);
                return (
                  <rect
                    key={series[seriesIndex]?.key ?? seriesIndex}
                    x={x}
                    y={PADDING.top + plotHeight - height}
                    width={barWidth}
                    height={height}
                    rx={Math.min(7, barWidth / 2)}
                    fill={series[seriesIndex]?.color ?? "var(--chart-1)"}
                    className="chart-bar"
                    opacity={active === null || active === groupIndex ? 1 : 0.35}
                  />
                );
              })}
              <text
                x={groupLeft + groupWidth / 2}
                y={VIEW_HEIGHT - PADDING.bottom + 20}
                textAnchor="middle"
                fontSize={12}
                fontWeight={500}
                fill={active === groupIndex ? "var(--chart-ink)" : "var(--chart-axis)"}
              >
                {groupIndex % labelStep === 0 || (showLast && groupIndex === data.length - 1) ? datum.label : null}
              </text>
            </g>
          );
        })}

        {/* Tooltip for the hovered group, pinned inside the plot. */}
        {active !== null ? (
          <g transform={`translate(${Math.min(Math.max(PADDING.left + slot * active + slot / 2 - 62, PADDING.left), VIEW_WIDTH - PADDING.right - 124)}, ${Math.max(activeTop - 16, 4)})`}>
            <rect width={124} height={30 + (data[active].hint ? 16 : 0)} rx={10} fill="var(--chart-tooltip)" />
            <text x={12} y={20} fontSize={12} fontWeight={600} fill="#ffffff">
              {series
                .map((entry, index) => `${entry.label}: ${formatValue(data[active].values[index] ?? 0)}`)
                .join("  ")}
            </text>
            {data[active].hint ? (
              <text x={12} y={36} fontSize={11} fill="#cbd5e1">
                {data[active].hint}
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>

      {/* Legend */}
      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {series.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
            {entry.label}
          </li>
        ))}
        {unit ? <li className="text-xs text-slate-400">{unit}</li> : null}
      </ul>
    </div>
  );
}
const GRID_LINES = 4;