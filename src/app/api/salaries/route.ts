import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher, TeacherSalary } from "@/Models";
import { removeSalaryExpense, salaryTotals, schoolIdFrom, syncSalaryExpense } from "@/lib/finance";
import { monthNames, pruneFinanceIfDue } from "@/lib/retention";

async function adminAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "admin") return { error: "Administrator access required", status: 403 };
  return { user: session.user };
}

/**
 * The last twelve (month, year) pairs, newest first. The salary tab only ever
 * offers this window, which is exactly what the one-year retention keeps.
 */
function recentSalaryMonths(count = 12, now: Date = new Date()) {
  const months: Array<{ month: string; year: number; key: string }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({
      month: monthNames[date.getUTCMonth()],
      year: date.getUTCFullYear(),
      key: `${monthNames[date.getUTCMonth()]}-${date.getUTCFullYear()}`,
    });
  }
  return months;
}

/**
 * GET /api/salaries — one row per active teacher for the requested month.
 *
 * Rows are not created just by looking: they are upserted when the admin marks
 * one paid or unpaid, and by the monthly cron for the whole staff. Teachers with
 * no row yet are reported with their CURRENT salary and status "unpaid", so the
 * tab always shows the full staff list rather than only what was touched.
 */
export async function GET(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    await pruneFinanceIfDue();

    const school = schoolIdFrom(access.user);
    if (!school) return NextResponse.json({ error: "School configuration is missing for this account" }, { status: 400 });

    const params = new URL(request.url).searchParams;
    const available = recentSalaryMonths();
    const requestedMonth = params.get("month")?.trim() ?? "";
    const requestedYear = Number(params.get("year"));
    const selected = available.find((item) => item.month === requestedMonth && item.year === requestedYear) ?? available[0];

    const teachers = await Teacher.find({ accountStatus: { $ne: "inactive" } })
      .sort({ name: 1 })
      .select("name subject salary")
      .lean();
    const records = await TeacherSalary.find({ school, month: selected.month, year: selected.year }).lean();
    const byTeacher = new Map(records.map((record) => [String(record.teacher), record]));

    const rows = teachers.map((teacher) => {
      const record = byTeacher.get(String(teacher._id));
      return {
        teacherId: String(teacher._id),
        name: teacher.name,
        subject: teacher.subject ?? "",
        salary: Number(record?.amount ?? teacher.salary ?? 0),
        status: record?.status === "paid" ? "paid" : "unpaid",
        paidDate: record?.paidDate ? new Date(record.paidDate).toISOString() : null,
        recordId: record ? String(record._id) : null,
      };
    });

    // Month-wise history over the same window the picker offers, so payroll can
    // be compared month by month without leaving the tab.
    const history = await TeacherSalary.aggregate<{ _id: { year: number; month: string }; paid: number; unpaid: number }>([
      { $match: { school, year: { $gte: available[available.length - 1].year } } },
      {
        $group: {
          _id: { year: "$year", month: "$month" },
          paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
          unpaid: { $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, "$amount", 0] } },
        },
      },
    ]);
    const historyByKey = new Map(history.map((row) => [`${row._id.year}-${row._id.month}`, row]));

    return NextResponse.json({
      month: selected.month,
      year: selected.year,
      months: available,
      rows,
      summary: {
        ...salaryTotals(rows.map((row) => ({ status: row.status, amount: row.salary }))),
        teachers: rows.length,
      },
      history: available.map((item) => {
        const row = historyByKey.get(`${item.year}-${item.month}`);
        const monthIndex = monthNames.indexOf(item.month);
        return {
          month: item.month,
          year: item.year,
          key: item.key,
          // `YYYY-MM` so the row can deep-link straight into the month filter.
          value: `${item.year}-${String(monthIndex + 1).padStart(2, "0")}`,
          paid: row?.paid ?? 0,
          unpaid: row?.unpaid ?? 0,
        };
      }),
    });
  } catch (error) {
    console.error("Salary list error:", error);
    return NextResponse.json({ error: "Unable to load teacher salaries" }, { status: 500 });
  }
}

/**
 * POST /api/salaries — marks one teacher's salary for a month paid or unpaid.
 * Marking paid writes the matching expense; reversing it removes that expense,
 * so the expense tab always mirrors this tab.
 */
export async function POST(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const teacherId = String(body.teacherId ?? "").trim();
    const month = String(body.month ?? "").trim();
    const year = Number(body.year);
    const status = String(body.status ?? "").trim();

    if (!mongoose.isValidObjectId(teacherId)) return NextResponse.json({ error: "A valid teacher is required" }, { status: 400 });
    if (!monthNames.includes(month)) return NextResponse.json({ error: "A valid month is required" }, { status: 400 });
    if (!Number.isInteger(year) || year <= 0) return NextResponse.json({ error: "A valid year is required" }, { status: 400 });
    if (status !== "paid" && status !== "unpaid") return NextResponse.json({ error: "Status must be paid or unpaid" }, { status: 400 });
    // Only the last twelve months are retained, so refuse anything older now
    // rather than creating a row the next prune would delete.
    if (!recentSalaryMonths().some((item) => item.month === month && item.year === year)) {
      return NextResponse.json({ error: "Salary records older than one year are not kept" }, { status: 400 });
    }

    await connectToDatabase();
    const school = schoolIdFrom(access.user);
    if (!school) return NextResponse.json({ error: "School configuration is missing for this account" }, { status: 400 });

    const teacher = await Teacher.findById(teacherId).select("name salary").lean();
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

    const salary = await TeacherSalary.findOneAndUpdate(
      { teacher: teacher._id, month, year },
      {
        $set: {
          amount: Number(teacher.salary ?? 0),
          status,
          paidDate: status === "paid" ? new Date() : null,
          markedBy: access.user.id,
          school,
        },
        $setOnInsert: { teacher: teacher._id, month, year },
      },
      { upsert: true, new: true },
    );

    if (status === "paid") {
      await syncSalaryExpense(salary, { _id: teacher._id, name: teacher.name }, school, access.user.id);
    } else {
      await removeSalaryExpense(salary._id);
    }

    return NextResponse.json({
      success: true,
      salary: {
        id: String(salary._id),
        teacherId,
        name: teacher.name,
        month,
        year,
        amount: salary.amount,
        status: salary.status,
        paidDate: salary.paidDate ? new Date(salary.paidDate).toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Salary update error:", error);
    return NextResponse.json({ error: "Unable to update the salary" }, { status: 500 });
  }
}