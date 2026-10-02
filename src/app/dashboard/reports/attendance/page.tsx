import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, TeacherAttendance } from "@/Models";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

const validDate = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value as string : "";

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = validDate(params.from) || today;
  const to = validDate(params.to) || today;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);
  const [studentRows, teacherRows] = await Promise.all([
    Attendance.aggregate([{ $match: { date: { $gte: start, $lte: end } } }, { $group: { _id: "$status", total: { $sum: 1 } } }]),
    TeacherAttendance.aggregate([{ $match: { date: { $gte: start, $lte: end } } }, { $group: { _id: "$status", total: { $sum: 1 } } }]),
  ]);
  const total = (rows: { _id: string; total: number }[], status: string) => rows.find((row) => row._id === status)?.total ?? 0;
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><BackLink /><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Reports</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Attendance report</h1><p className="mt-2 text-slate-500">Review attendance totals for students and teachers over any date range.</p></div><a href={`/api/reports/attendance?from=${from}&to=${to}`} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500">Export CSV</a></div><form method="get" className="mt-8 grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-3 sm:items-end"><label className="text-sm font-medium">From<input type="date" name="from" defaultValue={from} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" /></label><label className="text-sm font-medium">To<input type="date" name="to" defaultValue={to} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" /></label><button className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Apply report range</button></form><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Student present", total(studentRows, "present"), "text-emerald-600"],["Student absent", total(studentRows, "absent"), "text-rose-600"],["Teacher present", total(teacherRows, "present"), "text-blue-600"],["Teacher absent", total(teacherRows, "absent"), "text-amber-600"]].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-3 text-3xl font-bold ${color}`}>{value}</p><p className="mt-2 text-xs text-slate-400">{from} to {to}</p></div>)}</div></div></main>;
}
