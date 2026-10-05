"use strict";

/**
 * Analytics data layer for the admin panel.
 *
 * Every chart on /dashboard/analytics is fed from here. All of it is plain
 * Mongoose aggregation — no API round-trip and no client-side fetching — which
 * keeps the numbers identical to the rest of the admin screens and renders the
 * whole page in a single server pass.
 *
 * Server-only: it imports the Mongoose models directly, so it must never be
 * imported from a Client Component.
 */

import { Attendance, ClassSection, Fee, FinanceEntry, Homework, Student, Teacher, TeacherAttendance } from "@/Models";
import { monthNames } from "@/lib/retention";
import type { AttendanceStatus } from "@/components/charts/palette";

export type { AttendanceStatus };

/** Counts for every attendance status; absent keys read as 0. */
export type StatusCounts = Record<AttendanceStatus, number>;

/** The statuses a mark can actually be saved as (`unmarked` is derived). */
export const MARKED_STATUSES = ["present", "late", "absent", "leave", "holiday"] as const;

export function emptyStatusCounts(): StatusCounts {
  return { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, unmarked: 0 };
}

/** YYYY-MM-DD in UTC — the key format attendance records are stored under. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Attendance is written at UTC midnight (`new Date(`${date}T00:00:00.000Z`)`),
 * so every window here is built from UTC day boundaries. Local boundaries
 * would drop or double-count the midnight record on a PKT server.
 */
function dayWindow(key: string) {
  return { start: new Date(`${key}T00:00:00.000Z`), end: new Date(`${key}T23:59:59.999Z`) };
}

/** The window for "today". */
export function todayWindow(now: Date = new Date()) {
  return dayWindow(dayKey(now));
}

/**
 * The last `days` calendar days including today: `start` is the first day's
 * midnight and `end` is the end of today (so today is a partial day, not a
 * whole one that has not happened yet).
 */
export function recentWindow(days: number, now: Date = new Date()) {
  const first = new Date(new Date(dayKey(now)).getTime() - (days - 1) * 86_400_000);
  const end = new Date(new Date(dayKey(now)).getTime() + 86_400_000);
  return { start: first, end };
}

/** `$group` accumulators for the five saved statuses, reused by every rollup. */
function addStatusFields() {
  return {
    present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
    late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
    absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
    leave: { $sum: { $cond: [{ $eq: ["$status", "leave"] }, 1, 0] } },
    holiday: { $sum: { $cond: [{ $eq: ["$status", "holiday"] }, 1, 0] } },
  };
}

/** Present + late is what a school counts as "attended". */
export function attended(counts: Partial<StatusCounts>) {
  return (counts.present ?? 0) + (counts.late ?? 0);
}

/** Attendance rate over the days that were actually marked. */
export function attendanceRate(counts: Partial<StatusCounts>) {
  const marked = attended(counts) + (counts.absent ?? 0) + (counts.leave ?? 0);
  return marked ? Math.round((attended(counts) / marked) * 100) : 0;
}

/** Copies the five saved statuses off an aggregate row. */
function countsFromRow(row: Partial<StatusCounts>): StatusCounts {
  const counts = emptyStatusCounts();
  for (const status of MARKED_STATUSES) counts[status] = row[status] ?? 0;
  return counts;
}

/** Sum of every status that came from a save (i.e. excludes `unmarked`). */
function markedTotal(counts: StatusCounts) {
  return MARKED_STATUSES.reduce((sum, status) => sum + counts[status], 0);
}

/**
 * Today's student register split. `unmarked` is the roster minus everyone with
 * a record today — the slice a pie chart of saved statuses alone would hide,
 * and the number an admin actually needs to chase down.
 */
export async function todayStudentAttendance(now: Date = new Date()) {
  const { start, end } = todayWindow(now);
  const [rows, roster] = await Promise.all([
    Attendance.aggregate<{ _id: AttendanceStatus; total: number }>([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]),
    Student.countDocuments({ accountStatus: { $in: ["active", "pending"] } }),
  ]);
  const counts = emptyStatusCounts();
  for (const row of rows) counts[row._id] = row.total;
  counts.unmarked = Math.max(0, roster - markedTotal(counts));
  return { counts, roster, marked: markedTotal(counts) };
}

/** Today's teacher register split, with the same "not marked" logic. */
export async function todayTeacherAttendance(now: Date = new Date()) {
  const { start, end } = todayWindow(now);
  const [rows, roster] = await Promise.all([
    TeacherAttendance.aggregate<{ _id: AttendanceStatus; total: number }>([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]),
    Teacher.countDocuments({ accountStatus: { $ne: "inactive" } }),
  ]);
  const counts = emptyStatusCounts();
  for (const row of rows) counts[row._id] = row.total;
  counts.unmarked = Math.max(0, roster - markedTotal(counts));
  return { counts, roster, marked: markedTotal(counts) };
}

export type DailyPoint = {
  key: string;
  label: string;
  title: string;
  counts: StatusCounts;
  marked: number;
  rate: number;
};

/**
 * One point per day for the last `days` days, oldest first, with empty days
 * filled in so the line has no gaps. Days are grouped with `$dateToString` in
 * UTC because that is how attendance records are keyed.
 */
export async function attendanceTrend(days = 14, now: Date = new Date()): Promise<DailyPoint[]> {
  const { start, end } = recentWindow(days, now);
  const rows = await Attendance.aggregate<Partial<StatusCounts> & { _id: string }>([
    { $match: { date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } },
        ...addStatusFields(),
      },
    },
  ]);

  const byDay = new Map(rows.map((row) => [row._id, row]));
  const firstDay = new Date(dayKey(now) + "T00:00:00.000Z");
  const points: DailyPoint[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(firstDay.getTime() - (days - 1 - offset) * 86_400_000);
    const counts = countsFromRow(byDay.get(dayKey(date)) ?? {});
    points.push({
      key: dayKey(date),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      title: date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }),
      counts,
      marked: markedTotal(counts),
      rate: attendanceRate(counts),
    });
  }
  return points;
}

// ==========================================
// Attendance trend ranges
// ==========================================

/** How finely the attendance trend can be grouped. */
export type TrendRange = "daily" | "weekly" | "monthly" | "yearly";

/** How many buckets each range shows. */
const TREND_STEPS: Record<TrendRange, number> = { daily: 14, weekly: 12, monthly: 12, yearly: 5 };

export const TREND_RANGES: Array<{ value: TrendRange; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** The last twelve months as `YYYY-MM`, newest first — the month picker. */
export function recentMonths(count = 12, now: Date = new Date()) {
  const months: Array<{ value: string; label: string }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({
      value: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    });
  }
  return months;
}

/** The final instant a range should cover: the end of `anchor`, or today. */
function anchorEnd(anchor: string, now: Date) {
  const today = new Date(dayKey(now) + "T00:00:00.000Z");
  const match = /^(\d{4})-(\d{2})$/.exec(anchor);
  if (!match) return today;
  // Day 0 of the NEXT month number is the last day of the anchor month.
  const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0, 23, 59, 59, 999));
  // The current month can only be measured up to today.
  return end > today ? today : end;
}

/** First day of the window for a range ending at `end`. */
function rangeStart(range: TrendRange, end: Date) {
  const start = new Date(end);
  if (range === "daily") start.setUTCDate(start.getUTCDate() - (TREND_STEPS.daily - 1));
  else if (range === "weekly") start.setUTCDate(start.getUTCDate() - (TREND_STEPS.weekly * 7 - 1));
  else if (range === "monthly") start.setUTCMonth(start.getUTCMonth() - (TREND_STEPS.monthly - 1), 1);
  else start.setUTCFullYear(start.getUTCFullYear() - (TREND_STEPS.yearly - 1), 0, 1);
  // Weekly buckets are Monday-keyed, so the window starts on a Monday.
  if (range === "weekly") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

/** Advances one bucket and returns its stable string key. */
function stepRange(range: TrendRange, cursor: Date) {
  if (range === "monthly") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  else if (range === "yearly") cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
  else cursor.setUTCDate(cursor.getUTCDate() + (range === "weekly" ? 7 : 1));

  if (range === "monthly") return cursor.toISOString().slice(0, 7);
  if (range === "yearly") return String(cursor.getUTCFullYear());
  return cursor.toISOString().slice(0, 10);
}

/** Axis label for a bucket. */
function stepLabel(range: TrendRange, cursor: Date) {
  if (range === "yearly") return String(cursor.getUTCFullYear());
  if (range === "monthly") return cursor.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return cursor.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Fuller label used in the tooltip. */
function stepTitle(range: TrendRange, cursor: Date) {
  if (range === "yearly") return String(cursor.getUTCFullYear());
  if (range === "monthly") {
    return cursor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return cursor.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The `$dateToString` group key that matches how the buckets are keyed. */
function trendKeyExpression(range: TrendRange) {
  if (range === "monthly") return { $dateToString: { format: "%Y-%m", date: "$date", timezone: "UTC" } };
  if (range === "yearly") return { $dateToString: { format: "%Y", date: "$date", timezone: "UTC" } };
  if (range === "weekly") return { $dateToString: { format: "%Y-%m-%d", date: "$date", startOfWeek: "monday", timezone: "UTC" } };
  return { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } };
}

/**
 * Attendance bucketed by day, week, month or year, ending at `anchor`
 * (`YYYY-MM`) or today when no anchor is given. Empty buckets are filled with
 * zeros so the line stays continuous.
 *
 * Every range ends at the anchor, which is what makes the month picker
 * predictable: choose March and each range reads "up to and including March".
 */
export async function attendanceSeries(
  range: TrendRange,
  anchor = "",
  now: Date = new Date(),
): Promise<DailyPoint[]> {
  const end = anchorEnd(anchor, now);
  const start = rangeStart(range, end);
  const steps = TREND_STEPS[range];

  const rows = await Attendance.aggregate<Partial<StatusCounts> & { _id: { key: string } }>([
    { $match: { date: { $gte: start, $lt: new Date(end.getTime() + 86_400_000) } } },
    {
      $group: {
        _id: { key: trendKeyExpression(range), status: "$status" },
        ...addStatusFields(),
      },
    },
  ]);

  const byKey = new Map(rows.map((row) => [row._id.key, row]));
  const points: DailyPoint[] = [];
  const cursor = new Date(start);

  for (let step = 0; step < steps; step += 1) {
    const key = stepRange(range, cursor);
    const counts = countsFromRow(byKey.get(key) ?? {});
    points.push({
      key,
      label: stepLabel(range, cursor),
      title: stepTitle(range, cursor),
      counts,
      marked: markedTotal(counts),
      rate: attendanceRate(counts),
    });
  }
  return points;
}

/** Orders "9-A" before "10-A" instead of the plain string order "10" < "9". */
export function compareClassSections(a: string, b: string) {
  const [classA, sectionA = ""] = a.split("-");
  const [classB, sectionB = ""] = b.split("-");
  const numericA = Number(classA);
  const numericB = Number(classB);
  if (Number.isFinite(numericA) && Number.isFinite(numericB) && numericA !== numericB) return numericA - numericB;
  const byClass = classA.localeCompare(classB, undefined, { numeric: true });
  return byClass !== 0 ? byClass : sectionA.localeCompare(sectionB);
}

export type ClassRollup = {
  classSection: string;
  students: number;
  counts: StatusCounts;
  marked: number;
  rate: number;
};

/**
 * One row per class section, joined against the live roster so a class with no
 * register marked yet still shows its headcount (and a rate of 0) instead of
 * silently vanishing from the chart.
 */
export async function attendanceByClass(days = 30, now: Date = new Date()): Promise<ClassRollup[]> {
  const { start, end } = recentWindow(days, now);
  const [rows, roster] = await Promise.all([
    Attendance.aggregate<Partial<StatusCounts> & { _id: string; marked: number }>([
      { $match: { date: { $gte: start, $lt: end } } },
      { $group: { _id: "$classSection", marked: { $sum: 1 }, ...addStatusFields() } },
      { $sort: { marked: -1 } },
    ]),
    Student.aggregate<{ _id: { className: string; section: string }; students: number }>([
      { $match: { accountStatus: { $in: ["active", "pending"] } } },
      {
        $group: {
          _id: {
            className: { $toUpper: { $ifNull: ["$class", ""] } },
            section: { $toUpper: { $ifNull: ["$section", ""] } },
          },
          students: { $sum: 1 },
        },
      },
    ]),
  ]);

  const headcount = new Map(
    roster.map((row) => [`${row._id.className}-${row._id.section}`.replace(/-+$/, ""), row.students]),
  );

  const rollups: ClassRollup[] = rows.map((row) => {
    const counts = countsFromRow(row);
    return {
      classSection: row._id,
      students: headcount.get(row._id) ?? 0,
      counts,
      marked: row.marked,
      rate: attendanceRate(counts),
    };
  });

  for (const [classSection, students] of headcount) {
    if (classSection && !rollups.some((rollup) => rollup.classSection === classSection)) {
      rollups.push({ classSection, students, counts: emptyStatusCounts(), marked: 0, rate: 0 });
    }
  }

  return rollups.sort((a, b) => compareClassSections(a.classSection, b.classSection));
}

export type FeeMonth = { key: string; label: string; title: string; collected: number; outstanding: number };

/**
 * Collected vs outstanding fees for the last `months` calendar months, oldest
 * first. Months with no records are filled with zeros so the bars never jump.
 */
export async function feeTrend(months = 12, now: Date = new Date()): Promise<FeeMonth[]> {
  const keys: Array<{ year: number; month: string }> = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    keys.push({ year: date.getUTCFullYear(), month: monthNames[date.getUTCMonth()] });
  }

  const rows = await Fee.aggregate<{ _id: { year: number; month: string }; collected: number; outstanding: number }>([
    { $match: { $or: keys.map((key) => ({ year: key.year, month: key.month })) } },
    {
      $group: {
        _id: { year: "$year", month: "$month" },
        collected: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
        outstanding: { $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, "$amount", 0] } },
      },
    },
  ]);

  const lookup = new Map(rows.map((row) => [`${row._id.year}-${row._id.month}`, row]));
  return keys.map((key) => {
    const date = new Date(Date.UTC(key.year, monthNames.indexOf(key.month), 1));
    const row = lookup.get(`${key.year}-${key.month}`);
    return {
      key: `${key.year}-${key.month}`,
      label: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      title: date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      collected: row?.collected ?? 0,
      outstanding: row?.outstanding ?? 0,
    };
  });
}

/** Gender split across the roster; missing values are reported as "Not set". */
export async function genderSplit() {
  const rows = await Student.aggregate<{ _id: string | null; total: number }>([
    { $group: { _id: "$gender", total: { $sum: 1 } } },
  ]);
  const buckets = new Map(rows.map((row) => [row._id ?? "unset", row.total]));
  return [
    { key: "female", label: "Female", value: buckets.get("female") ?? 0 },
    { key: "male", label: "Male", value: buckets.get("male") ?? 0 },
    { key: "other", label: "Other", value: buckets.get("other") ?? 0 },
    { key: "unset", label: "Not set", value: buckets.get("unset") ?? 0 },
  ];
}

/** How many active homework assignments each class currently has. */
export async function homeworkByClass(limit = 8) {
  const now = new Date();
  const rows = await Homework.aggregate<{ _id: string; total: number; overdue: number }>([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$classSection",
        total: { $sum: 1 },
        overdue: { $sum: { $cond: [{ $lt: ["$dueDate", now] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);
  return rows.map((row) => ({ classSection: row._id || "Unassigned", total: row.total, overdue: row.overdue }));
}

export type RiskStudent = {
  id: string;
  name: string;
  classSection: string;
  rollNumber: string;
  marked: number;
  attended: number;
  rate: number;
  absent: number;
};

export type ClassNeedsAttention = {
  classSection: string;
  students: number;
  marked: number;
  unmarked: number;
  rate: number;
};

/**
 * Classes with students still missing from the attendance register in the
 * selected window. These are the follow-up classes admins should review first.
 */
export async function unmarkedClassesBySection(days = 30, now: Date = new Date()): Promise<ClassNeedsAttention[]> {
  const { start, end } = recentWindow(days, now);
  const [rows, roster] = await Promise.all([
    Attendance.aggregate([
      { $match: { date: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: "$classSection",
          marked: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $eq: ["$status", "leave"] }, 1, 0] } },
          holiday: { $sum: { $cond: [{ $eq: ["$status", "holiday"] }, 1, 0] } },
        },
      },
      { $sort: { marked: 1 } },
    ]),
    Student.aggregate([
      { $match: { accountStatus: { $in: ["active", "pending"] } } },
      {
        $group: {
          _id: {
            className: { $toUpper: { $ifNull: ["$class", ""] } },
            section: { $toUpper: { $ifNull: ["$section", ""] } },
          },
          students: { $sum: 1 },
        },
      },
    ]),
  ]);

  const headcount = new Map(
    roster.map((row) => [`${row._id.className}-${row._id.section}`.replace(/-+$/, ""), row.students]),
  );

  const needed: ClassNeedsAttention[] = [];
  for (const row of rows) {
    const total = headcount.get(row._id) ?? 0;
    const marked = row.marked;
    const unmarked = Math.max(0, total - marked);
    if (total > 0 && unmarked > 0) {
      const counts = countsFromRow(row);
      needed.push({
        classSection: row._id,
        students: total,
        marked,
        unmarked,
        rate: attendanceRate(counts),
      });
    }
  }

  for (const [classSection, total] of headcount) {
    if (!classSection || total === 0) continue;
    const matching = needed.find((entry) => entry.classSection === classSection);
    if (!matching) {
      needed.push({ classSection, students: total, marked: 0, unmarked: total, rate: 0 });
    }
  }

  return needed.sort((a, b) => b.unmarked - a.unmarked || compareClassSections(a.classSection, b.classSection));
}

/**
 * Students whose attendance in the window is worst. A student needs at least
 * three marked days before a percentage means anything, so short-history
 * students are filtered out rather than ranked first by accident.
 */
export async function attendanceRisk(days = 30, limit = 5, now: Date = new Date()): Promise<RiskStudent[]> {
  const { start, end } = recentWindow(days, now);
  const rows = await Attendance.aggregate<{
    _id: string;
    marked: number;
    attended: number;
    absent: number;
    student: { fullName: string; class: string; section: string; rollNumber: string };
  }>([
    { $match: { date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: "$student",
        marked: { $sum: 1 },
        attended: { $sum: { $cond: [{ $in: ["$status", ["present", "late"]] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
      },
    },
    { $match: { marked: { $gte: 3 } } },
    {
      $lookup: {
        from: "students",
        localField: "_id",
        foreignField: "_id",
        as: "student",
        pipeline: [{ $project: { fullName: 1, class: 1, section: 1, rollNumber: 1 } }],
      },
    },
    { $unwind: "$student" },
    { $sort: { attended: 1, absent: -1 } },
    { $limit: limit },
  ]);

  return rows.map((row) => ({
    id: String(row._id),
    name: row.student.fullName,
    classSection: `${row.student.class}-${row.student.section}`,
    rollNumber: row.student.rollNumber,
    marked: row.marked,
    attended: row.attended,
    absent: row.absent,
    rate: row.marked ? Math.round((row.attended / row.marked) * 100) : 0,
  }));
}

/** Headline counts for the summary strip above the charts. */
export async function schoolSnapshot() {
  const [classes, teachers, activeStudents, pendingRequests] = await Promise.all([
    ClassSection.countDocuments({ isActive: true }),
    Teacher.countDocuments({ accountStatus: { $ne: "inactive" } }),
    Student.countDocuments({ accountStatus: "active" }),
    Student.countDocuments({ accountStatus: "pending" }),
  ]);
  return { classes, teachers, activeStudents, pendingRequests };
}

// ==========================================
// Finance
// ==========================================

/** How the finance trend chart can be bucketed. */
export type FinanceBucket = "daily" | "weekly" | "monthly" | "yearly";

export const FINANCE_BUCKETS: Array<{ value: FinanceBucket; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** Months of history each bucket shows — it mirrors the one-year retention window. */
const BUCKET_SPAN: Record<FinanceBucket, number> = { daily: 30, weekly: 26, monthly: 12, yearly: 5 };

/**
 * `$dateToString` is used for every bucket rather than `$dateTrunc` because it
 * works on every MongoDB version the app supports, and because the weekly form
 * can snap to a Monday, giving a stable, sortable key per week.
 */
function bucketExpression(bucket: FinanceBucket) {
  if (bucket === "monthly") return { $dateToString: { format: "%Y-%m", date: "$date", timezone: "UTC" } };
  if (bucket === "yearly") return { $dateToString: { format: "%Y", date: "$date", timezone: "UTC" } };
  if (bucket === "weekly") return { $dateToString: { format: "%Y-%m-%d", date: "$date", startOfWeek: "monday", timezone: "UTC" } };
  return { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } };
}

/** How many buckets to render, and the first day of the window. */
function bucketPlan(bucket: FinanceBucket, now: Date) {
  const today = new Date(dayKey(now) + "T00:00:00.000Z");
  const steps = BUCKET_SPAN[bucket];
  const start = new Date(today);
  if (bucket === "monthly") start.setUTCMonth(start.getUTCMonth() - (steps - 1), 1);
  else if (bucket === "yearly") start.setUTCFullYear(start.getUTCFullYear() - (steps - 1), 0, 1);
  else start.setUTCDate(start.getUTCDate() - (steps - 1));
  return { start, steps };
}

/** The string key a given cursor date produces for a bucket. */
function bucketKey(bucket: FinanceBucket, cursor: Date) {
  if (bucket === "yearly") return String(cursor.getUTCFullYear());
  if (bucket === "monthly") return cursor.toISOString().slice(0, 7);
  return cursor.toISOString().slice(0, 10);
}

export type FinanceTrendPoint = { key: string; label: string; title: string; income: number; expense: number; net: number };

/**
 * Income vs expense per bucket across the retention window. Buckets with no
 * entries are filled with zeros so the bars stay evenly spaced and the chart
 * reads as a continuous timeline rather than a jagged one.
 */
export async function financeTrend(bucket: FinanceBucket, now: Date = new Date()): Promise<FinanceTrendPoint[]> {
  const { start, steps } = bucketPlan(bucket, now);
  const rows = await FinanceEntry.aggregate<{ _id: { key: string; type: string }; total: number }>([
    { $match: { date: { $gte: start } } },
    {
      $group: {
        _id: { key: bucketExpression(bucket), type: "$type" },
        total: { $sum: "$amount" },
      },
    },
  ]);

  const byKey = new Map(rows.map((row) => [`${row._id.key}|${row._id.type}`, row.total]));
  const points: FinanceTrendPoint[] = [];

  for (let step = 0; step < steps; step += 1) {
    const cursor = new Date(start);
    if (bucket === "monthly") cursor.setUTCMonth(cursor.getUTCMonth() + step);
    else if (bucket === "yearly") cursor.setUTCFullYear(cursor.getUTCFullYear() + step);
    else cursor.setUTCDate(cursor.getUTCDate() + step);

    const key = bucketKey(bucket, cursor);
    const income = byKey.get(`${key}|income`) ?? 0;
    const expense = byKey.get(`${key}|expense`) ?? 0;
    points.push({
      key,
      label: bucket === "yearly"
        ? key
        : bucket === "monthly"
          ? cursor.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
          : cursor.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      title: bucket === "monthly"
        ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
        : cursor.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
      income,
      expense,
      net: income - expense,
    });
  }
  return points;
}

/** Total income, expense and balance inside an optional date window. */
export async function financeTotals(range?: { start?: Date; end?: Date }) {
  const match = range
    ? { date: { ...(range.start ? { $gte: range.start } : {}), ...(range.end ? { $lte: range.end } : {}) } }
    : {};
  const rows = await FinanceEntry.aggregate<{ _id: string; total: number; count: number }>([
    { $match: match },
    { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const income = rows.find((row) => row._id === "income");
  const expense = rows.find((row) => row._id === "expense");
  return {
    income: income?.total ?? 0,
    expense: expense?.total ?? 0,
    incomeCount: income?.count ?? 0,
    expenseCount: expense?.count ?? 0,
    balance: (income?.total ?? 0) - (expense?.total ?? 0),
  };
}

/** Spend (or income) split by category, biggest first, for the donut charts. */
export async function financeByCategory(type: "income" | "expense") {
  const rows = await FinanceEntry.aggregate<{ _id: string; total: number; count: number }>([
    { $match: { type } },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  return rows.map((row) => ({ category: row._id, total: row.total, count: row.count }));
}