import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import {
  TREND_RANGES,
  attendanceByClass,
  attendanceRate,
  attendanceRisk,
  attendanceSeries,
  feeTrend,
  genderSplit,
  homeworkByClass,
  recentMonths,
  schoolSnapshot,
    todayStudentAttendance,
    todayTeacherAttendance,
    type TrendRange,
  } from "@/lib/analytics";
import {
  SERIES_COLORS,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TEXT_CLASS,
  formatCount,
  formatMoney,
  rateColor,
} from "@/components/charts/palette";
import ChartCard, { EmptyChart } from "@/components/charts/ChartCard";
import DonutChart from "@/components/charts/DonutChart";
import BarChart from "@/components/charts/BarChart";
import TrendChart from "@/components/charts/TrendChart";

export const dynamic = "force-dynamic";

const CLASS_WINDOW_DAYS = 30;

/** Builds a URL that keeps the other filters intact when one changes. */
function analyticsHref(params: { range?: string; month?: string }) {
  const query = new URLSearchParams();
  if (params.range && params.range !== "daily") query.set("range", params.range);
  if (params.month) query.set("month", params.month);
  const search = query.toString();
  return search ? `/dashboard/analytics?${search}` : "/dashboard/analytics";
}

/** Builds donut slices for a status breakdown, in the order admins read them. */
function statusSlices(counts: Record<string, number>) {
  return STATUS_ORDER.map((status) => ({
    label: STATUS_LABEL[status],
    value: counts[status] ?? 0,
    color: STATUS_COLOR[status],
    textClass: STATUS_TEXT_CLASS[status],
  }));
}

/** Small headline card above the charts. */
function SnapshotTile({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent}`} aria-hidden="true" />
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </Link>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; month?: string }>;
}) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();

  const now = new Date();
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Both filters are validated against real options, so a hand-edited URL can
  // never put an unsupported value into the aggregation.
  const params = await searchParams;
  const months = recentMonths(12, now);
  const range = (TREND_RANGES.some((item) => item.value === params.range) ? params.range : "daily") as TrendRange;
  const month = months.some((item) => item.value === params.month) ? params.month! : "";
  const monthLabel = months.find((item) => item.value === month)?.label ?? "";
  const rangeSteps = { daily: 14, weekly: 12, monthly: 12, yearly: 5 }[range];
  const rangeUnit = { daily: "days", weekly: "weeks", monthly: "months", yearly: "years" }[range];

  const [studentsToday, teachersToday, trend, classes, fees, genders, homework, risk, snapshot] = await Promise.all([
    todayStudentAttendance(now),
    todayTeacherAttendance(now),
    attendanceSeries(range, month, now),
    attendanceByClass(CLASS_WINDOW_DAYS, now),
    feeTrend(12, now),
    genderSplit(),
    homeworkByClass(),
    attendanceRisk(CLASS_WINDOW_DAYS, 5, now),
    schoolSnapshot(),
  ]);

  const studentRate = attendanceRate(studentsToday.counts);
  const teacherRate = attendanceRate(teachersToday.counts);
  const studentsIn = studentsToday.counts.present + studentsToday.counts.late;
  const collected = fees.reduce((sum, month) => sum + month.collected, 0);
  const outstanding = fees.reduce((sum, month) => sum + month.outstanding, 0);

  // Cap the class chart so a large school stays readable on a phone.
  const visibleClasses = classes.slice(0, 12);
  const bestClass = classes.reduce<(typeof classes)[number] | null>(
    (best, row) => (row.marked > 0 && (!best || row.rate > best.rate) ? row : best),
    null,
  );

  return (
    <div className="app-page bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="dashboard-overview-hero relative overflow-hidden rounded-3xl bg-blue-700 p-6 text-white shadow-lg shadow-blue-900/10 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200 sm:text-sm">{todayLabel}</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">School analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-blue-100 sm:text-base">
            Today&apos;s registers, attendance broken down by {range}, and a {CLASS_WINDOW_DAYS}-day comparison across every class.
          </p>
        </header>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotTile
            label="Active students"
            value={formatCount(snapshot.activeStudents)}
            hint={`${formatCount(snapshot.pendingRequests)} request(s) awaiting approval`}
            href="/dashboard/students"
            accent="bg-blue-500"
          />
           <SnapshotTile
             label="Attendance today"
             value={`${studentRate}%`}
             hint={`${formatCount(studentsIn)} present · ${formatCount(studentsToday.counts.absent + studentsToday.counts.late + studentsToday.counts.leave)} absent · ${formatCount(studentsToday.counts.unmarked)} not marked`}
             href="/dashboard/analytics/today?view=unmarked"
             accent="bg-emerald-500"
           />
          <SnapshotTile
            label="Fees outstanding"
            value={formatMoney(outstanding)}
            hint={`${formatMoney(collected)} collected in 12 months`}
            href="/dashboard/fees"
            accent="bg-amber-500"
          />
          <SnapshotTile
            label="Teaching staff"
            value={formatCount(snapshot.teachers)}
            hint={`${teacherRate}% present today`}
            href="/dashboard/teachers"
            accent="bg-violet-500"
          />
        </div>

        {/* Today's two registers — the pie charts the overview asked for. */}
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <ChartCard
            eyebrow="Today"
            title="Student attendance"
            subtitle={`${formatCount(studentsToday.marked)} of ${formatCount(studentsToday.roster)} students marked · ${studentRate}% attendance`}
            action={{ href: "/dashboard/attendance", label: "Mark attendance" }}
          >
            {studentsToday.roster === 0 ? (
              <EmptyChart message="No students on the roster yet. Add students to see today's attendance." />
            ) : (
              <DonutChart
                slices={statusSlices(studentsToday.counts)}
                centerLabel="Students"
                centerHint={`${studentRate}% attended`}
                sliceHref={STATUS_ORDER.map((status) => {
                  if (status === "present" || status === "late") return "/dashboard/analytics/today?view=present";
                  if (status === "unmarked") return "/dashboard/analytics/today?view=unmarked";
                  return undefined;
                })}
              />
            )}
          </ChartCard>

          <ChartCard
            eyebrow="Today"
            title="Teacher attendance"
            subtitle={`${formatCount(teachersToday.marked)} of ${formatCount(teachersToday.roster)} teachers marked · ${teacherRate}% attendance`}
            action={{ href: "/dashboard/teacher-attendance", label: "Manage" }}
          >
            {teachersToday.roster === 0 ? (
              <EmptyChart message="No teachers on the roster yet. Add teachers to see their attendance." />
            ) : (
              <DonutChart
                slices={statusSlices(teachersToday.counts)}
                centerLabel="Teachers"
                centerHint={`${teacherRate}% attended`}
                size={200}
                thickness={26}
              />
            )}
          </ChartCard>
        </div>

        {/* Trends */}
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <ChartCard
            className="xl:col-span-2"
            eyebrow={monthLabel ? `Up to ${monthLabel}` : `Latest ${rangeSteps} ${rangeUnit}`}
            title="Attendance rate trend"
            subtitle="Share of marked days each student was present or late."
          >
            {/* Range and month are plain links, so the chart stays server-rendered
                and the selection is shareable and back-button friendly. */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {TREND_RANGES.map((item) => (
                  <Link
                    key={item.value}
                    href={analyticsHref({ range: item.value, month })}
                    aria-current={range === item.value ? "page" : undefined}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                      range === item.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <form method="get" className="flex items-center gap-2">
                {range !== "daily" ? <input type="hidden" name="range" value={range} /> : null}
                <label className="sr-only" htmlFor="analytics-month">Month</label>
                <select
                  id="analytics-month"
                  name="month"
                  defaultValue={month}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="">Up to today</option>
                  {months.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <button type="submit" className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500">
                  Apply
                </button>
                {month ? (
                  <Link href={analyticsHref({ range })} className="text-xs font-semibold text-slate-500 hover:underline">
                    Reset
                  </Link>
                ) : null}
              </form>
            </div>
            {trend.some((point) => point.marked > 0) ? (
              <TrendChart
                points={trend.map((point) => ({ label: point.label, title: point.title, value: point.rate }))}
                color="var(--chart-present)"
                valueFormat="percent"
                suffix="%"
              />
            ) : (
              <EmptyChart message="No attendance has been marked in this period yet." />
            )}
          </ChartCard>

          <ChartCard eyebrow="Roster" title="Students by gender" subtitle="Every student record on file.">
            <DonutChart
              slices={genders.map((entry, index) => ({
                label: entry.label,
                value: entry.value,
                color: SERIES_COLORS[index % SERIES_COLORS.length],
              }))}
              centerLabel="Students"
              centerHint="in the roster"
              size={190}
              thickness={26}
            />
          </ChartCard>
        </div>

        {/* Per-class comparison */}
        <ChartCard
          className="mt-5"
          eyebrow={`Last ${CLASS_WINDOW_DAYS} days`}
          title="Attendance by class"
          subtitle={
            bestClass
              ? `Best attended: ${bestClass.classSection} at ${bestClass.rate}%. Hover a bar for the full split.`
              : "Mark a register to compare classes against each other."
          }
          action={{ href: "/dashboard/classes", label: "Manage classes" }}
        >
          {visibleClasses.length === 0 ? (
            <EmptyChart message="No classes yet. Create a class section to start comparing attendance." />
          ) : (
            <BarChart
              data={visibleClasses.map((row) => ({
                label: row.classSection,
                values: [row.counts.present, row.counts.late, row.counts.absent, row.counts.leave],
                hint: `${formatCount(row.marked)} marked · ${row.rate}% rate · ${formatCount(row.students)} students`,
              }))}
              series={[
                { key: "present", label: "Present", color: STATUS_COLOR.present },
                { key: "late", label: "Late", color: STATUS_COLOR.late },
                { key: "absent", label: "Absent", color: STATUS_COLOR.absent },
                { key: "leave", label: "Leave", color: STATUS_COLOR.leave },
              ]}
            />
          )}
        </ChartCard>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <ChartCard
            eyebrow="Last 12 months"
            title="Fee collection"
            subtitle={`${formatMoney(collected)} collected · ${formatMoney(outstanding)} still outstanding.`}
            action={{ href: "/dashboard/finance?bucket=monthly", label: "Open finance" }}
          >
            <BarChart
              data={fees.map((month) => ({
                label: month.label,
                values: [month.collected, month.outstanding],
                hint: month.title,
              }))}
              series={[
                { key: "collected", label: "Collected", color: "var(--chart-present)" },
                { key: "outstanding", label: "Outstanding", color: "var(--chart-late)" },
              ]}
              valueFormat="money-compact"
            />
          </ChartCard>

          <ChartCard eyebrow="Homework" title="Assignments per class" subtitle="Active homework an admin can act on.">
            {homework.length === 0 ? (
              <EmptyChart message="No homework has been assigned yet." />
            ) : (
              <BarChart
                data={homework.map((row) => ({
                  label: row.classSection,
                  values: [row.total - row.overdue, row.overdue],
                  hint: row.overdue ? `${row.overdue} past the due date` : "All within the due date",
                }))}
                series={[
                  { key: "open", label: "Within due date", color: "var(--chart-1)" },
                  { key: "overdue", label: "Past due date", color: "var(--chart-absent)" },
                ]}
              />
            )}
          </ChartCard>
        </div>

        {/* Attendance watchlist */}
        <ChartCard
          className="mt-5"
          eyebrow={`Last ${CLASS_WINDOW_DAYS} days`}
          title="Students needing attention"
          subtitle="Lowest attendance rate among students with at least three marked days."
          action={{ href: "/dashboard/students", label: "All students" }}
        >
          {risk.length === 0 ? (
            <EmptyChart message="Not enough marked attendance yet to build this list." />
          ) : (
            <div className="overflow-x-auto">
              <table className="stack-table w-full text-left text-sm md:min-w-[520px]">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 font-semibold">Student</th>
                    <th className="py-3 font-semibold">Class</th>
                    <th className="py-3 text-right font-semibold">Marked</th>
                    <th className="py-3 text-right font-semibold">Absent</th>
                    <th className="py-3 text-right font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {risk.map((student) => (
                    <tr key={student.id}>
                      <td data-full className="py-3">
                        <Link href={`/dashboard/students/${student.id}`} className="font-semibold text-blue-700 hover:underline">
                          {student.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-400">Roll {student.rollNumber || "-"}</p>
                      </td>
                      <td data-label="Class" className="py-3 text-slate-600">{student.classSection}</td>
                      <td data-label="Marked" className="py-3 text-right tabular-nums text-slate-600">{formatCount(student.marked)}</td>
                      <td data-label="Absent" className="py-3 text-right tabular-nums text-rose-600">{formatCount(student.absent)}</td>
                      <td data-label="Rate" className="py-3">
                        <span className="flex items-center justify-end gap-2 font-semibold tabular-nums text-slate-900">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${student.rate}%`, backgroundColor: rateColor(student.rate) }}
                            />
                          </span>
                          {student.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}