import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { FinanceEntry } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, isCategory, schoolIdFrom } from "@/lib/finance";
import { monthNames, pruneFinanceIfDue } from "@/lib/retention";

async function adminAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "admin") return { error: "Administrator access required", status: 403 };
  if ((await cookies()).get("finance_unlocked")?.value !== "1") return { error: "Finance access is locked", status: 423 };
  return { user: session.user };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The retention window, mirrored in lib/retention.ts — a year back from today. */
function retentionCutoff() {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return cutoff;
}

/**
 * GET /api/finance — one page of ledger rows plus the totals for the exact
 * filter that produced them, so the summary strip can never disagree with the
 * list underneath it.
 *
 * Filters: type, category, classSection, search, from, to, source, page, limit.
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
    const type = params.get("type")?.trim() ?? "";
    const category = params.get("category")?.trim() ?? "";
    const classSection = params.get("classSection")?.trim().toUpperCase() ?? "";
    const source = params.get("source")?.trim() ?? "";
    const search = params.get("search")?.trim() ?? "";
    const from = params.get("from")?.trim() ?? "";
    const to = params.get("to")?.trim() ?? "";
    const monthName = params.get("month")?.trim() ?? "";
    const monthYear = Number(params.get("year"));

    const scope: Record<string, unknown>[] = [{ school }];
    if (type === "income" || type === "expense") scope.push({ type });
    if (category) scope.push({ category });
    if (classSection) scope.push({ classSection });
    if (source === "auto" || source === "manual") scope.push({ source });

    // A whole-month shortcut, which is what the month picker sends. It wins
    // over from/to so the two controls can never disagree with each other.
    const monthIndex = monthNames.indexOf(monthName);
    if (monthIndex >= 0 && Number.isInteger(monthYear) && monthYear > 0) {
      scope.push({ date: { $gte: new Date(Date.UTC(monthYear, monthIndex, 1)), $lt: new Date(Date.UTC(monthYear, monthIndex + 1, 1)) } });
    } else if (DATE_PATTERN.test(from) || DATE_PATTERN.test(to)) {
      const date: Record<string, Date> = {};
      if (DATE_PATTERN.test(from)) date.$gte = new Date(`${from}T00:00:00.000Z`);
      if (DATE_PATTERN.test(to)) date.$lte = new Date(`${to}T23:59:59.999Z`);
      scope.push({ date });
    }
    if (search) {
      // Escaped so a literal "Rs 1,000" cannot smuggle in a regex.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      scope.push({ title: { $regex: safe, $options: "i" } });
    }

    const filter = { $and: scope };
    const limit = parsePageSize(params.get("limit"), 20);
    const total = await FinanceEntry.countDocuments(filter);
    const pages = countPages(total, limit);
    const page = clampPage(parsePageNumber(params.get("page")), pages);

    const entries = await FinanceEntry.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(params.get("format") === "csv" ? 0 : (page - 1) * limit)
      .limit(params.get("format") === "csv" ? 5000 : limit)
      .populate("student", "fullName class section rollNumber")
      .populate("teacher", "name subject")
      .lean();

    if (params.get("format") === "csv") {
      const csvValue = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
      const rows = [
        ["Date", "Type", "Category", "Description", "Amount", "Source", "Class / section", "Student", "Teacher", "Note"],
        ...entries.map((entry) => [
          new Date(entry.date).toISOString().slice(0, 10),
          entry.type,
          entry.category,
          entry.title,
          entry.amount,
          entry.source,
          entry.classSection ?? "",
          entry.student?.fullName ?? "",
          entry.teacher?.name ?? "",
          entry.note ?? "",
        ]),
      ];
      return new Response(rows.map((row) => row.map(csvValue).join(",")).join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="finance-${type || "ledger"}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const totals = await FinanceEntry.aggregate<{ _id: string; total: number; count: number }>([
      { $match: filter },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const income = totals.find((row) => row._id === "income");
    const expense = totals.find((row) => row._id === "expense");

    // Category breakdown for the donuts, over the same filter minus type.
    const withoutType = scope.filter((condition) => !("type" in condition));
    const categories = await FinanceEntry.aggregate<{ _id: { category: string; type: string }; total: number; count: number }>([
      { $match: { $and: withoutType } },
      { $group: { _id: { category: "$category", type: "$type" }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const classSections = (await FinanceEntry.distinct("classSection", { school, classSection: { $nin: ["", null] } }))
      .map(String)
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      entries,
      summary: {
        income: income?.total ?? 0,
        expense: expense?.total ?? 0,
        incomeCount: income?.count ?? 0,
        expenseCount: expense?.count ?? 0,
        balance: (income?.total ?? 0) - (expense?.total ?? 0),
      },
      categories: categories.map((row) => ({ category: row._id.category, type: row._id.type, total: row.total, count: row.count })),
      classSections,
      categoryOptions: { income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES },
      pagination: { page, pages, total, limit },
    });
  } catch (error) {
    console.error("Finance list error:", error);
    return NextResponse.json({ error: "Unable to load finance records" }, { status: 500 });
  }
}

/** POST /api/finance — adds a manual income or expense row. */
export async function POST(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const type = String(body.type ?? "").trim();
    const category = String(body.category ?? "").trim();
    const title = String(body.title ?? "").trim();
    const note = String(body.note ?? "").trim();
    const classSection = String(body.classSection ?? "").trim().toUpperCase();
    const date = String(body.date ?? "").trim();
    const amount = Number(body.amount);

    if (type !== "income" && type !== "expense") {
      return NextResponse.json({ error: "Type must be income or expense" }, { status: 400 });
    }
    if (!isCategory(type, category)) {
      return NextResponse.json({ error: `Choose a valid ${type} category` }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: "Description is required" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }
    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
    }

    await connectToDatabase();
    const school = schoolIdFrom(access.user);
    if (!school) return NextResponse.json({ error: "School configuration is missing for this account" }, { status: 400 });

    // Retention keeps a rolling year, so refuse a date the next prune would
    // silently delete instead of accepting a row that vanishes later.
    const entryDate = new Date(`${date}T12:00:00.000Z`);
    if (entryDate < retentionCutoff()) {
      return NextResponse.json({ error: "Records older than one year are not kept" }, { status: 400 });
    }

    const entry = await FinanceEntry.create({
      type,
      category,
      title,
      note,
      amount,
      date: entryDate,
      source: "manual",
      classSection,
      recordedBy: access.user.id,
      school,
    });
    await pruneFinanceIfDue();
    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    console.error("Finance create error:", error);
    return NextResponse.json({ error: "Unable to add the record" }, { status: 500 });
  }
}

/** DELETE /api/finance?id=… — removes one manual row. */
export async function DELETE(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "A valid record id is required" }, { status: 400 });
    await connectToDatabase();
    const school = schoolIdFrom(access.user);
    if (!school) return NextResponse.json({ error: "School configuration is missing for this account" }, { status: 400 });
    // Only manual rows are deletable here: an automatic row belongs to the fee
    // or salary it came from and is reversed there, so the two never diverge.
    const deleted = await FinanceEntry.findOneAndDelete({ _id: id, school, source: "manual" });
    if (!deleted) {
      return NextResponse.json({ error: "Record not found, or it was created automatically" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Finance delete error:", error);
    return NextResponse.json({ error: "Unable to delete the record" }, { status: 500 });
  }
}