import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { financeByCategory, financeTotals, financeTrend, type FinanceBucket } from "@/lib/analytics";
import BarChart from "@/components/charts/BarChart";
import DonutChart from "@/components/charts/DonutChart";
import ChartCard, { EmptyChart } from "@/components/charts/ChartCard";
import { SERIES_COLORS, formatCount, formatMoney } from "@/components/charts/palette";

export const dynamic = "force-dynamic";

const BUCKETS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

/** How much history each granularity covers, used in the subtitles. */
const BUCKET_WINDOW: Record<string, string> = {
  daily: "last 30 days",
  weekly: "last 26 weeks",
  monthly: "last 12 months",
  yearly: "last 5 years",
};

/**
 * Overview tab — the money at a glance.
 *
 * A Server Component, so the charts are drawn from the database on the server
 * and arrive as finished HTML. `?bucket=` re-renders at another granularity,
 * which keeps the Daily/Weekly/Monthly/Yearly toggle a plain link rather than
 * client state — no spinner, and the choice is shareable.
 */
export default async function FinanceOverview({ bucket }: { bucket: string }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();

  // Narrowed to FinanceBucket by the membership check, so the chart and the
  // ?bucket= link can never drift onto an unsupported value.
  const selected = (BUCKETS.some((item) => item.value === bucket) ? bucket : "daily") as FinanceBucket;

  const [totals, trend, incomeByCategory, expenseByCategory] = await Promise.all([
    financeTotals(),
    financeTrend(selected),
    financeByCategory("income"),
    financeByCategory("expense"),
  ]);

  const best = trend.reduce((winner, point) => (!winner || point.net > winner.net ? point : winner), trend[0]);
  const hasData = totals.income > 0 || totals.expense > 0;

  const tiles = [
    { label: "Total income", value: formatMoney(totals.income), hint: `${formatCount(totals.incomeCount)} records`, tone: "bg-emerald-500" },
    { label: "Total expenses", value: formatMoney(totals.expense), hint: `${formatCount(totals.expenseCount)} records`, tone: "bg-rose-500" },
    { label: "Balance", value: formatMoney(totals.balance), hint: totals.balance >= 0 ? "Surplus overall" : "Deficit overall", tone: totals.balance >= 0 ? "bg-blue-500" : "bg-amber-500" },
    { label: "Best period", value: best ? formatMoney(best.net) : "Rs 0", hint: best ? `Net in the ${BUCKET_WINDOW[selected]}` : "No data yet", tone: "bg-violet-500" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tile.tone}`} aria-hidden="true" />
              <p className="text-sm text-slate-500">{tile.label}</p>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{tile.value}</p>
            <p className="mt-1 text-xs text-slate-400">{tile.hint}</p>
          </div>
        ))}
      </div>

      <ChartCard eyebrow="Income vs expenses" title="Money in and out" subtitle={`Grouped across the ${BUCKET_WINDOW[selected]}.`}>
        <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {BUCKETS.map((item) => (
            <Link
              key={item.value}
              href={`/dashboard/finance?bucket=${item.value}`}
              aria-current={selected === item.value ? "page" : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                selected === item.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        {!hasData ? (
          <EmptyChart message="No income or expenses recorded yet. Mark a student fee paid, or add a record from the Income or Expenses tab." />
        ) : (
          <BarChart
            data={trend.map((point) => ({
              label: point.label,
              values: [point.income, point.expense],
              hint: `${point.title} · Net ${formatMoney(point.net)}`,
            }))}
            series={[
              { key: "income", label: "Income", color: "var(--chart-present)" },
              { key: "expense", label: "Expenses", color: "var(--chart-absent)" },
            ]}
            valueFormat="money-compact"
          />
        )}
      </ChartCard>
<div className="grid gap-5 xl:grid-cols-2">
        <ChartCard eyebrow="Where money comes from" title="Income by category" subtitle="Share of every rupee received.">
          {incomeByCategory.length ? (
            <DonutChart
              slices={incomeByCategory.map((row, index) => ({
                label: row.category,
                value: row.total,
                color: SERIES_COLORS[index % SERIES_COLORS.length],
              }))}
              centerLabel="Income"
              centerHint={`${formatCount(incomeByCategory.length)} categories`}
            />
          ) : (
            <EmptyChart message="No income recorded yet." />
          )}
        </ChartCard>

        <ChartCard eyebrow="Where money goes" title="Expenses by category" subtitle="Share of every rupee spent.">
          {expenseByCategory.length ? (
            <DonutChart
              slices={expenseByCategory.map((row, index) => ({
                label: row.category,
                value: row.total,
                color: SERIES_COLORS[index % SERIES_COLORS.length],
              }))}
              centerLabel="Expenses"
              centerHint={`${formatCount(expenseByCategory.length)} categories`}
            />
          ) : (
            <EmptyChart message="No expenses recorded yet." />
          )}
        </ChartCard>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold text-slate-900">How this tab stays in step</h2>
        <p className="mt-1 text-sm text-slate-500">
          The ledger is written by the screens you already use, so it cannot drift away from them.
        </p>
        <ul className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <li className="rounded-xl bg-slate-50 p-4">Marking a student fee <strong className="font-semibold text-emerald-700">paid</strong> adds an income row with that class and date.</li>
          <li className="rounded-xl bg-slate-50 p-4">Marking a teacher salary <strong className="font-semibold text-rose-700">paid</strong> adds an expense row.</li>
          <li className="rounded-xl bg-slate-50 p-4">Reversing either one removes its row again, so the totals always match.</li>
          <li className="rounded-xl bg-slate-50 p-4">Anything older than one year is deleted from the database automatically.</li>
        </ul>
      </section>
    </div>
  );
}