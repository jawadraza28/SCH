/**
 * Chart palette + small formatting helpers shared by every chart.
 *
 * The actual color VALUES live in globals.css as `--chart-*` tokens (they are
 * re-declared for the Midnight theme). Components only ever reference the token
 * names below, so a theme switch recolors the charts with no JS involved.
 */

/** The five attendance statuses the app records, plus "not marked yet". */
export type AttendanceStatus = "present" | "absent" | "late" | "leave" | "holiday" | "unmarked";

/** CSS custom property that paints a status. */
export const STATUS_COLOR: Record<AttendanceStatus, string> = {
  present: "var(--chart-present)",
  late: "var(--chart-late)",
  absent: "var(--chart-absent)",
  leave: "var(--chart-leave)",
  holiday: "var(--chart-holiday)",
  unmarked: "var(--chart-unmarked)",
};

/** Tailwind text utility matching each status, for legends and tooltips. */
export const STATUS_TEXT_CLASS: Record<AttendanceStatus, string> = {
  present: "text-emerald-600",
  late: "text-amber-600",
  absent: "text-rose-600",
  leave: "text-violet-600",
  holiday: "text-slate-500",
  unmarked: "text-slate-400",
};

/** Human label for a status. */
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  leave: "On leave",
  holiday: "Holiday",
  unmarked: "Not marked",
};

/** Order statuses appear in legends: the ones an admin acts on come first. */
export const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave", "holiday", "unmarked"];

/** Categorical ramp for charts that are not about attendance (fees, classes). */
export const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

/** Green → amber → red, used to shade attendance-rate cells and bars. */
export function rateColor(rate: number) {
  if (rate >= 90) return "var(--chart-present)";
  if (rate >= 75) return "var(--chart-late)";
  return "var(--chart-absent)";
}

/** Thousands-separated integer, e.g. 1234 → "1,234". */
export function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/** Compact money for axis labels: 1,250,000 → "1.25M". */
export function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(absolute >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

/** Full money with separators, e.g. 12500 → "Rs 12,500". */
export function formatMoney(value: number) {
  return `Rs ${formatCount(value)}`;
}

/**
 * How a chart should print a value.
 *
 * Charts are Client Components but are rendered from Server Components, and
 * React cannot pass a FUNCTION across that boundary. So the page names the
 * format it wants and the chart resolves it here, which keeps every prop
 * serializable (see formatByKind).
 */
export type ValueFormat = "count" | "money" | "money-compact" | "percent";

/** Resolves a ValueFormat name to the formatter the charts call internally. */
export function formatByKind(value: number, format: ValueFormat): string {
  if (format === "money") return formatMoney(value);
  if (format === "money-compact") return formatCompactMoney(value);
  if (format === "percent") return String(Math.round(value));
  return formatCount(value);
}

/**
 * A "nice" axis maximum (1, 2, 5 × 10ⁿ) that is always ≥ the data maximum, so
 * gridlines land on readable numbers instead of arbitrary decimals.
 */
export function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}