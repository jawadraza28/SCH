import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { financeByCategory, financeTotals } from "@/lib/analytics";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance";
import { FinanceEntry } from "@/Models";
import FinanceWorkspace, { type FinancePayload } from "./FinanceWorkspace";
import FinanceOverview from "./FinanceOverview";
import FinanceGate from "./FinanceGate";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * /dashboard/finance — the admin money area.
 *
 * Renders the tabbed workspace shell and seeds it with one page of ledger rows
 * so the first paint needs no client fetch. The Overview tab draws its own
 * charts on the server (FinanceOverview) because it groups by time.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; bucket?: string }>;
}) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  const financeCookie = (await cookies()).get("finance_unlocked")?.value;
  if (financeCookie !== "1") return <FinanceGate />;
  await connectToDatabase();

  // Deep links such as ?tab=expenses&month=March-2026 open that tab already
  // filtered, which is how the salary history links into the expenses list.
  const params = await searchParams;
  const initialTab = (["overview", "income", "expenses", "salaries"] as const).includes(params.tab as never)
    ? (params.tab as "overview" | "income" | "expenses" | "salaries")
    : "overview";
  const initialMonth = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : "";

  const school = session.user.school ? String(session.user.school) : null;
  const [entries, totals, categories, classSections] = await Promise.all([
    FinanceEntry.find({ school }).sort({ date: -1, createdAt: -1 }).limit(20)
      .populate("student", "fullName class section rollNumber")
      .populate("teacher", "name subject")
      .lean(),
    financeTotals(),
    Promise.all([financeByCategory("income"), financeByCategory("expense")]),
    FinanceEntry.distinct("classSection", { school, classSection: { $nin: ["", null] } }),
  ]);

  const [incomeCategories, expenseCategories] = categories;
  const initial: FinancePayload = {
    entries: entries.map((entry) => ({
      _id: String(entry._id),
      type: entry.type,
      category: entry.category,
      title: entry.title,
      note: entry.note ?? "",
      amount: entry.amount,
      date: new Date(entry.date).toISOString(),
      source: entry.source,
      classSection: entry.classSection ?? "",
      student: entry.student
        ? {
            fullName: entry.student.fullName,
            class: entry.student.class,
            section: entry.student.section,
            rollNumber: entry.student.rollNumber ?? "",
          }
        : null,
      teacher: entry.teacher ? { name: entry.teacher.name, subject: entry.teacher.subject ?? "" } : null,
    })),
    summary: totals,
    categories: [
      ...incomeCategories.map((row) => ({ ...row, type: "income" as const })),
      ...expenseCategories.map((row) => ({ ...row, type: "expense" as const })),
    ],
    classSections: classSections.map(String).filter(Boolean).sort(),
    categoryOptions: { income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES },
    pagination: { page: 1, pages: 1, total: totals.incomeCount + totals.expenseCount, limit: 20 },
  };

  return (
    <div className="app-page bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="dashboard-overview-hero relative overflow-hidden rounded-3xl bg-emerald-700 p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200 sm:text-sm">Money</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Income, expenses &amp; salaries</h1>
          <p className="mt-2 max-w-2xl text-sm text-emerald-50 sm:text-base">
            Fees become income the moment they are marked paid, salaries become expenses the same way. One rolling year of history is kept.
          </p>
        </header>

        <div className="mt-5">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white shadow-sm" />}>
            <FinanceWorkspace
              initial={initial}
              overview={<FinanceOverview bucket={params.bucket ?? "daily"} />}
              initialTab={initialTab}
              initialMonth={initialMonth}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}