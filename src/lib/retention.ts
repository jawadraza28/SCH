"use strict";

import { Attendance, Fee } from "@/Models";

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The oldest date that is still kept: the current month plus the previous eleven
 * calendar months, which is exactly one year of history.
 */
export function retentionCutoff(now: Date = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 11, 1);
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

/** Deletes attendance records older than one year and returns the deleted count. */
export async function pruneAttendance(now: Date = new Date()) {
  const result = await Attendance.deleteMany({ date: { $lt: retentionCutoff(now) } });
  return result.deletedCount ?? 0;
}

/** Deletes fee records older than one year and returns the deleted count. */
export async function pruneFees(now: Date = new Date()) {
  const result = await Fee.deleteMany(feeRetentionFilter(now));
  return result.deletedCount ?? 0;
}

let lastPrunedAt = 0;
const pruneIntervalMs = 60 * 60 * 1000;

/**
 * Keeps MongoDB at exactly one year of attendance and fee history even when no
 * cron job has been configured. Runs at most once per hour per server instance.
 */
export async function pruneRetentionIfDue(now: Date = new Date()) {
  if (Date.now() - lastPrunedAt < pruneIntervalMs) return;
  lastPrunedAt = Date.now();
  try {
    await Promise.all([pruneAttendance(now), pruneFees(now)]);
  } catch (error) {
    // Retention must never break the write that triggered it.
    console.error("Retention cleanup error:", error);
  }
}
