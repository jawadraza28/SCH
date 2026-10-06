"use strict";

/**
 * Fee backfill for new admissions.
 *
 * When a student joins, every month BEFORE the current one is considered
 * already settled: the office does not chase old fees for a fresh admission.
 * This helper writes those months as paid fee rows so the fees tab, the student
 * portal and the finance ledger all agree from day one — and because they are
 * ordinary paid rows, the admin can still reverse any of them with "Mark unpaid"
 * when something is actually still owed.
 *
 * Rules:
 *   - Only the months of the one-year fee window strictly before "now" are
 *     written, so nothing outside retention is ever created.
 *   - Priced exactly like the fees screen: the class's own fee when it has one,
 *     otherwise the school-wide monthly fee. No price configured → nothing to
 *     write, the admin can mark months manually once a fee exists.
 *   - Months that already carry a fee row are left untouched.
 *   - Every created row is mirrored into the finance income ledger, the same
 *     way "Mark paid" and "Mark all paid" do it.
 */

import mongoose from "mongoose";
import { ClassSection, Fee, SchoolConfiguration } from "@/Models";
import { lastTwelveMonths } from "@/lib/fees";
import { monthNames } from "@/lib/retention";
import { syncFeeIncome } from "@/lib/finance";

/** Escapes a literal so it can sit inside a `^…$` regex safely. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The slice of a student document this helper needs. */
type StudentLike = { _id: unknown; fullName: string; class: string; section: string };

/**
 * Creates paid fee rows for every past month of the student's one-year window
 * and returns how many months were written. Never throws: an admission must not
 * fail because the ledger was unavailable, so problems are logged instead.
 */
export async function backfillPaidPastMonths(
  student: StudentLike,
  school: unknown,
  markedBy: unknown,
  now: Date = new Date(),
): Promise<number> {
  try {
    // Price the same way the fees screen does: class fee first, school fee as
    // the fallback. A student whose fee cannot be priced gets no rows.
    const classSection = await ClassSection.findOne({
      className: { $regex: `^${escapeRegex(String(student.class))}$`, $options: "i" },
      sectionName: { $regex: `^${escapeRegex(String(student.section))}$`, $options: "i" },
    }).select("fee").lean();
    const schoolId = mongoose.isValidObjectId(school) ? String(school) : "";
    const schoolConfig = schoolId ? await SchoolConfiguration.findById(schoolId).lean() : null;
    const classFee = Number(classSection?.fee ?? 0);
    const amount = classFee > 0 ? classFee : Number(schoolConfig?.monthlyFee ?? 0);
    if (!(amount > 0)) return 0;

    // The window is the current month plus the previous eleven; only the ones
    // strictly before the current month are "previous" for this admission.
    const past = lastTwelveMonths(now).filter((entry) => {
      const monthIndex = monthNames.indexOf(entry.month);
      return entry.year < now.getFullYear() || (entry.year === now.getFullYear() && monthIndex < now.getMonth());
    });
    if (past.length === 0) return 0;

    const existing = await Fee.find({ student: student._id }).select("month year").lean();
    const have = new Set(existing.map((fee) => `${fee.month}-${fee.year}`));
    const targets = past.filter((entry) => !have.has(entry.key));
    if (targets.length === 0) return 0;

    let created = 0;
    for (const entry of targets) {
      try {
        const fee = await Fee.create({
          student: student._id,
          month: entry.month,
          year: entry.year,
          amount,
          paidAmount: amount,
          status: "paid",
          paidDate: now,
          markedBy,
        });
        created += 1;
        // Mirror into the income ledger so the finance tab agrees with the
        // fees tab, exactly like every other path that marks a fee paid.
        if (schoolId) await syncFeeIncome(fee, student, schoolId, markedBy);
      } catch (error) {
        console.error("Fee backfill month error:", error);
      }
    }
    return created;
  } catch (error) {
    console.error("Fee backfill error:", error);
    return 0;
  }
}
