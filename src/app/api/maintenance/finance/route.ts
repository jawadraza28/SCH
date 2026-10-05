import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration, Teacher, TeacherSalary } from "@/Models";
import { pruneFinanceEntries, pruneTeacherSalary } from "@/lib/retention";
import { monthNames } from "@/lib/retention";

/**
 * GET /api/maintenance/finance — Vercel cron entry.
 *
 * Two jobs, both about keeping the finance data to one rolling year:
 *  1. open the month by creating an UNPAID salary row for every active teacher,
 *     so the salary tab starts the month with the full staff list already there;
 *  2. delete salary rows and ledger entries older than a year.
 *
 * Both steps are idempotent, so a retried or doubled cron run is harmless.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findOne().select("_id").lean();
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });

    const now = new Date();
    const month = monthNames[now.getUTCMonth()];
    const year = now.getUTCFullYear();
    const teachers = await Teacher.find({ accountStatus: { $ne: "inactive" } }).select("_id salary").lean();

    // $setOnInsert keeps this safe to re-run: an existing row (paid or not) is
    // never touched, so a rerun cannot reset a salary the admin already paid.
    let created = 0;
    for (const teacher of teachers) {
      const result = await TeacherSalary.updateOne(
        { teacher: teacher._id, month, year },
        { $setOnInsert: { teacher: teacher._id, month, year, amount: Number(teacher.salary ?? 0), status: "unpaid", school: school._id } },
        { upsert: true },
      );
      if (result.upsertedCount) created += 1;
    }

    const prunedSalaries = await pruneTeacherSalary(now);
    const prunedEntries = await pruneFinanceEntries(now);
    return NextResponse.json({ success: true, month, year, created, prunedSalaries, prunedEntries });
  } catch (error) {
    console.error("Finance maintenance error:", error);
    return NextResponse.json({ error: "Unable to run finance maintenance" }, { status: 500 });
  }
}