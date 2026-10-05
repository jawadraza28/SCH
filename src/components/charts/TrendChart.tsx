"use client";

/**
 * TrendChart — an area + line chart for a single measure over time
 * (attendance rate per day, fees collected per month).
 *
 * Straight segments join the points: this is daily attendance data where the
 * exact number matters more than a pretty curve, and the area underneath fades
 * to transparent so the grid stays visible. Hovering anywhere on the plot snaps
 * a dot to the nearest point and shows that day's exact value.
 *
 * A Client Component because of the hover state. As with BarChart, values are
 * printed through a named `valueFormat` — a function prop could not cross the
 * server/client boundary.
 */

import { useState } from "react";
import { formatByKind, niceCeiling, type ValueFormat } from "./palette";

export type TrendPoint = {
  /** Short axis label, e.g. "12 Mar". */
  label: string;
  value: number;
  /** Full label for the tooltip, e.g. "12 March 2026". */
  title?: string;
};

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 240;
const PADDING = { top: 22, right: 16, bottom: 32, left: 44 };
const GRID_LINES = 4;

export default function TrendChart({
  points,
  color = "var(--chart-1)",
  valueFormat = "count",
  suffix = "",
  caption,
  className = "",
}: {
  points: TrendPoint[];
  /** Line + gradient color. */
  color?: string;
  /** Names the formatter used for axis ticks, the tooltip and the caption. */
  valueFormat?: ValueFormat;
  /** Appended to the tooltip value only (e.g. "%" or " students"). */
  suffix?: string;
  /** Small line under the chart, e.g. "Best: 96% on 12 March". */
  caption?: string;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const formatValue = (value: number) => formatByKind(value, valueFormat);
  // Same contract as BarChart: an empty series must not crash the page.
  if (points.length === 0) return <div className={className} />;

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const maxValue = points.reduce((max, point) => Math.max(max, point.value), 0);
  const ceiling = niceCeiling(maxValue) || 1;

  // A single point has no "previous" neighbour, so fan it out to two samples
  // — the curve degenerates to a straight line instead of dividing by zero.
  const samples = points.length === 1 ? [points[0], points[0]] : points;
  const step = samples.length > 1 ? plotWidth / (samples.length - 1) : 0;
  const x = (index: number) => PADDING.left + (samples.length > 1 ? index * step : plotWidth / 2);
  const y = (value: number) => PADDING.top + plotHeight - (value / ceiling) * plotHeight;

  const coords = samples.map((point, index) => ({ x: x(index), y: y(point.value) }));
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(2)} ${PADDING.top + plotHeight} L${coords[0].x.toFixed(2)} ${PADDING.top + plotHeight} Z`;

  const best = points.reduce<TrendPoint | null>((winner, point) => (!winner || point.value > winner.value ? point : winner), null);
  const note = caption ?? (best ? `Peak ${formatValue(best.value)}${suffix}${best.title ? ` on ${best.title}` : ""}` : "");

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Trend chart. ${note}`}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {Array.from({ length: GRID_LINES + 1 }, (_, index) => {
          const ratio = index / GRID_LINES;
          const lineY = PADDING.top + plotHeight - ratio * plotHeight;
          return (
            <g key={index}>
              <line
                x1={PADDING.left}
                x2={VIEW_WIDTH - PADDING.right}
                y1={lineY}
                y2={lineY}
                stroke="var(--chart-grid)"
                strokeWidth={index === 0 ? 1.5 : 1}
                strokeDasharray={index === 0 ? undefined : "4 6"}
              />
              <text x={PADDING.left - 10} y={lineY + 4} textAnchor="end" fontSize={12} fill="var(--chart-axis)">
                {formatValue(ceiling * ratio)}
              </text>
            </g>
          );
        })}

        <path d={area} fill="url(#trend-fill)" className="chart-enter" />
        <path d={line} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="chart-enter" />

        {coords.map((point, index) => (
          <circle
            key={samples[index].label}
            cx={point.x}
            cy={point.y}
            r={active === index ? 6 : 3.5}
            fill={color}
            stroke="var(--chart-grid)"
            strokeWidth={2}
            className="chart-bar"
          />
        ))}

        {/* X labels: first, last and evenly spaced middles — enough to orient
            the reader without them colliding on a phone. */}
        {points.map((point, index) => {
          const stride = Math.max(1, Math.ceil(points.length / 7));
          if (index % stride !== 0 && index !== points.length - 1) return null;
          return (
            <text
              key={`${point.label}-label`}
              x={x(points.length === 1 ? 0 : index)}
              y={VIEW_HEIGHT - PADDING.bottom + 20}
              textAnchor="middle"
              fontSize={12}
              fill="var(--chart-axis)"
            >
              {point.label}
            </text>
          );
        })}

        {active !== null ? (
          <g transform={`translate(${Math.min(Math.max(coords[active].x - 70, PADDING.left), VIEW_WIDTH - PADDING.right - 140)}, ${Math.max(coords[active].y - 46, 4)})`}>
            <rect width={140} height={38} rx={10} fill="var(--chart-tooltip)" />
            <text x={12} y={16} fontSize={11} fill="#cbd5e1">
              {samples[active].title ?? samples[active].label}
            </text>
            <text x={12} y={31} fontSize={13} fontWeight={700} fill="#ffffff">
              {formatValue(samples[active].value)}
              {suffix}
            </text>
          </g>
        ) : null}

        {/* Invisible columns capture the pointer so the whole plot is hoverable. */}
        {coords.map((point, index) => (
          <rect
            key={`${samples[index].label}-hit`}
            x={point.x - step / 2}
            y={PADDING.top}
            width={Math.max(step, 12)}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setActive(index)}
          />
        ))}
      </svg>
      {note ? <p className="mt-3 text-center text-xs text-slate-400">{note}</p> : null}
    </div>
  );
}