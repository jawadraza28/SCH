"use strict";

/**
 * Finance helpers: the categories an admin can pick, and the two functions
 * that keep the ledger in step with the fees and salary tabs.
 *
 * The rule this file enforces: the ledger is never allowed to disagree with
 * the record it came from. Marking a fee paid writes (or rewrites) exactly one
 * income entry keyed by that fee; marking it unpaid deletes that entry again.
 * The same holds for salaries on the expense side.
 */

import mongoose from "mongoose";
import { FinanceEntry } from "@/Models";

/** Categories available when adding income by hand. */
export const INCOME_CATEGORIES = [
  "Class fee",
  "Admission fee",
  "Exam fee",
  "Transport fee",
  "Books and uniform",
  "Donation",
  "Other income",
] as const;

/** Categories available when adding an expense by hand. */
export const EXPENSE_CATEGORIES = [
  "Teacher salary",
  "Utilities",
  "Rent",
  "Supplies",
  "Maintenance",
  "Transport",
  "Events and trips",
  "Other expense",
] as const;

/** Category written automatically when a student fee is marked paid. */
export const AUTO_INCOME_CATEGORY = "Class fee";
/** Category written automatically when a teacher salary is marked paid. */
export const AUTO_EXPENSE_CATEGORY = "Teacher salary";

export function categoriesFor(type: "income" | "expense"): readonly string[] {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function isCategory(type: "income" | "expense", category: string): boolean {
  return categoriesFor(type).includes(category as never);
}

/** The user's school id, validated — every finance row is scoped to a school. */
export function schoolIdFrom(user: { school?: unknown }) {
  return mongoose.isValidObjectId(user.school) ? (user.school as string) : null;
}

/**
 * Writes the income entry for a fee the admin just marked paid, or removes it
 * when the payment is reversed. Safe to call repeatedly: it upserts on the fee
 * id, so re-marking paid — or topping up a custom payment — updates the amount
 * instead of double counting. The row carries the money actually received, so a
 * partly paid month contributes only what came in.
 */
export async function syncFeeIncome(
  fee: { _id: unknown; amount: number; paidAmount?: number; month: string; year: number; paidDate?: Date | null },
  student: { _id: unknown; fullName: string; class: string; section: string },
  school: string,
  recordedBy: unknown,
) {
  // paidAmount wins when present; rows from before the field existed fall back
  // to the full fee, which is exactly what "paid" meant back then.
  const received = Number(fee.paidAmount ?? 0) > 0 ? Number(fee.paidAmount) : Number(fee.amount);
  await FinanceEntry.updateOne(
    { fee: fee._id },
    {
      $set: {
        type: "income",
        category: AUTO_INCOME_CATEGORY,
        title: `${student.fullName} · ${student.class}-${student.section} · ${fee.month} ${fee.year}`,
        amount: received,
        // The chart groups by when the money moved, not when the row was written.
        date: fee.paidDate ?? new Date(),
        source: "auto",
        classSection: `${student.class}-${student.section}`.toUpperCase(),
        student: student._id,
        note: `Monthly class fee for ${fee.month} ${fee.year}`,
        recordedBy,
        school,
      },
      $setOnInsert: { fee: fee._id },
    },
    { upsert: true },
  );
}

/** Removes the income entry that belongs to a fee (payment reversed). */
export async function removeFeeIncome(feeId: unknown) {
  await FinanceEntry.deleteMany({ fee: feeId });
}

/**
 * Writes the expense entry for a salary the admin just marked paid, or removes
 * it when reversed. Mirrors syncFeeIncome exactly.
 */
export async function syncSalaryExpense(
  salary: { _id: unknown; amount: number; month: string; year: number; paidDate?: Date | null },
  teacher: { _id: unknown; name: string },
  school: string,
  recordedBy: unknown,
) {
  await FinanceEntry.updateOne(
    { salary: salary._id },
    {
      $set: {
        type: "expense",
        category: AUTO_EXPENSE_CATEGORY,
        title: `${teacher.name} · ${salary.month} ${salary.year}`,
        amount: salary.amount,
        date: salary.paidDate ?? new Date(),
        source: "auto",
        teacher: teacher._id,
        note: `Monthly salary for ${salary.month} ${salary.year}`,
        recordedBy,
        school,
      },
      $setOnInsert: { salary: salary._id },
    },
    { upsert: true },
  );
}

/** Removes the expense entry that belongs to a salary (payment reversed). */
export async function removeSalaryExpense(salaryId: unknown) {
  await FinanceEntry.deleteMany({ salary: salaryId });
}

/** Recomputes a month's paid/unpaid salary totals for one teacher. */
export function salaryTotals(rows: Array<{ status: string; amount: number }>) {
  return rows.reduce(
    (totals, row) => {
      if (row.status === "paid") totals.paid += row.amount;
      else totals.unpaid += row.amount;
      return totals;
    },
    { paid: 0, unpaid: 0 },
  );
}