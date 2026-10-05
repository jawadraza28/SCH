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

import { Attendance, ClassSection, Fee, Homework, Student, Teacher, TeacherAttendance } from "@/Models";
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