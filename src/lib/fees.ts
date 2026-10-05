"use strict";

import { monthNames } from "@/lib/retention";

export type FeeMonth = { month: string; year: number; key: string };

/**
 * The current month plus the previous eleven calendar months, oldest first.
 * This is the one year fee window the school keeps for every student.
 */
export function lastTwelveMonths(now: Date = new Date()): FeeMonth[] {
  const months: FeeMonth[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = monthNames[date.getMonth()];
    months.push({ month, year: date.getFullYear(), key: `${month}-${date.getFullYear()}` });
  }
  return months;
}

/** The same window, most recent month first, which is easier to read in tables. */
export function lastTwelveMonthsNewestFirst(now: Date = new Date()): FeeMonth[] {
  return lastTwelveMonths(now).reverse();
}

// =========================================================================
// Partial (custom) payments
// =========================================================================

/** A month is unpaid, partly paid, or fully paid. */
export type FeeStatus = "paid" | "partial" | "unpaid";

/** The slice of a fee document these helpers need. */
export type FeeRecord = {
  amount?: number;
  paidAmount?: number;
  status?: string;
} | null | undefined;

/**
 * Money actually received for a fee row.
 *
 * Rows written before `paidAmount` existed carry only `status`, so a record
 * marked "paid" back then was paid in full and is read as such here. Anything
 * else counts as nothing received until an admin records a payment.
 */
export function feePaidAmount(record: FeeRecord): number {
  if (!record) return 0;
  const recorded = Number(record.paidAmount ?? 0);
  if (Number.isFinite(recorded) && recorded > 0) return recorded;
  return record.status === "paid" ? Number(record.amount ?? 0) : 0;
}

/** The status implied by an amount due and the money received against it. */
export function feeStatusOf(amount: number, paidAmount: number): FeeStatus {
  if (!(paidAmount > 0)) return "unpaid";
  // A rounding-tolerance comparison, so 2999.999 still counts as 3000 paid.
  if (paidAmount >= amount - 0.001) return "paid";
  return "partial";
}

/** What is still owed on a fee. Never negative, even if a row overshoots. */
export function feeRemaining(amount: number, paidAmount: number): number {
  return Math.max(0, amount - paidAmount);
}

/** Adds `received` to what was already paid, clamped to the amount due. */
export function applyPayment(amount: number, alreadyPaid: number, received: number): number {
  return Math.min(amount, Math.max(0, alreadyPaid + received));
}
