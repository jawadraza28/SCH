"use strict";

import { Attendance, Fee, FinanceEntry, Homework, TeacherAttendance, TeacherSalary } from "@/Models";

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The oldest date that is still kept is exactly one year before now.
 */
export function retentionCutoff(now: Date = new Date()) {
  return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
}

/**
 * Matching filter for fee records that fall outside the one year window.
 */
export function feeRetentionFilter(now: Date = new Date()) {
  const cutoff = retentionCutoff(now);
  const cutoffYear = cutoff.getFullYear();
  const monthsBeforeCutoff = monthNames.slice(0, cutoff.getMonth());
  const conditions: Record<string, unknown>[] = [{ year: { $lt: cutoffYear } }];
  if (monthsBeforeCutoff.length) {
    conditions.push({ year: cutoffYear, month: { $in: monthsBeforeCutoff } });
  }
  return { $or: conditions };
}

/** Deletes attendance records older than one year. */
export async function pruneAttendance(now: Date = new Date()) {
  const result = await Attendance.deleteMany({ date: { $lt: retentionCutoff(now) } });
  return result.deletedCount ?? 0;
}

/** Deletes fee records older than one year. */
export async function pruneFees(now: Date = new Date()) {
  const result = await Fee.deleteMany(feeRetentionFilter(now));
  return result.deletedCount ?? 0;
}

export async function pruneExpiredHomework(now: Date = new Date()) {
  const result = await Homework.deleteMany({ expiryDate: { $lt: now } });
  return result.deletedCount ?? 0;
}

export async function pruneTeacherAttendance(now: Date = new Date()) {
  const result = await TeacherAttendance.deleteMany({ date: { $lt: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()) } });
  return result.deletedCount ?? 0;
}

let lastPrunedAt = 0;
const pruneIntervalMs = 60 * 60 * 1000;

/** Deletes teacher salary rows older than one year. */
export async function pruneTeacherSalary(now: Date = new Date()) {
  const result = await TeacherSalary.deleteMany({
    $or: [{ paidDate: { $lt: retentionCutoff(now) } }, { paidDate: { $exists: false }, createdAt: { $lt: retentionCutoff(now) } }],
  });
  return result.deletedCount ?? 0;
}

/** Deletes ledger rows older than one year, keyed on the money-movement date. */
export async function pruneFinanceEntries(now: Date = new Date()) {
  const result = await FinanceEntry.deleteMany({ date: { $lt: retentionCutoff(now) } });
  return result.deletedCount ?? 0;
}

/**
 * Keeps MongoDB at one year of attendance and fee history even when no
 * cron job has been configured. Runs at most once per hour per server instance.
 */
export async function pruneRetentionIfDue(now: Date = new Date()) {
  if (Date.now() - lastPrunedAt < pruneIntervalMs) return;
  lastPrunedAt = Date.now();
  try {
    await Promise.all([pruneAttendance(now), pruneFees(now), pruneFinanceEntries(now)]);
  } catch (error) {
    // Retention must never break the write that triggered it.
    console.error("Retention cleanup error:", error);
  }

}

let lastTeacherAttendancePrunedAt = 0;
export async function pruneTeacherAttendanceIfDue(now: Date = new Date()) {
  if (Date.now() - lastTeacherAttendancePrunedAt < pruneIntervalMs) return;
  lastTeacherAttendancePrunedAt = Date.now();
  try {
    await pruneTeacherAttendance(now);
  } catch (error) {
    console.error("Teacher attendance retention cleanup error:", error);
  }
}

let lastFinancePrunedAt = 0;
/**
 * Salaries use their own throttle because they are only touched by the finance
 * cron and the salary tab — not by every write that calls pruneRetentionIfDue.
 */
export async function pruneFinanceIfDue(now: Date = new Date()) {
  if (Date.now() - lastFinancePrunedAt < pruneIntervalMs) return;
  lastFinancePrunedAt = Date.now();
  try {
    await Promise.all([pruneFinanceEntries(now), pruneTeacherSalary(now)]);
  } catch (error) {
    console.error("Finance retention cleanup error:", error);
  }
}
