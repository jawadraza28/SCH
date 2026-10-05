import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import {
  attendanceByClass,
  attendanceRate,
  attendanceRisk,
  attendanceTrend,
  feeTrend,
  genderSplit,
  homeworkByClass,
  schoolSnapshot,
  todayStudentAttendance,
  todayTeacherAttendance,
} from "@/lib/analytics";
import {
  SERIES_COLORS,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TEXT_CLASS,
  formatCompactMoney,
  formatCount,
  formatMoney,
  rateColor,
} from "@/components/charts/palette";
import ChartCard, { EmptyChart } from "@/components/charts/ChartCard";
import DonutChart from "@/components/charts/DonutChart";
import BarChart from "@/components/charts/BarChart";
import TrendChart from "@/components/charts/TrendChart";

export const dynamic = "force-dynamic";

const TREND_DAYS = 14;
const CLASS_WINDOW_DAYS = 30;

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
    <a
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent}`} aria-hidden="true" />
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </a>
  );
}

export default async function AnalyticsPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();

  const now = new Date();
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const [studentsToday, teachersToday, trend, classes, fees, genders, homework, risk, snapshot] = await Promise.all([
    todayStudentAttendance(now),
    todayTeacherAttendance(now),
    attendanceTrend(TREND_DAYS, now),
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