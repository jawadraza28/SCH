import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Student } from "@/Models";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function StudentAttendancePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  if (!student) return <main className="min-h-screen bg-slate-100 p-8 text-center">Student profile not found.</main>;
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const range = { student: student._id, date: { $gte: cutoff } };
  const limit = DEFAULT_PAGE_SIZE;
  const total = await Attendance.countDocuments(range);
  const pages = countPages(total, limit);
  const page = clampPage(parsePageNumber((await searchParams).page), pages);
  // Summary covers the whole twelve-month window while the table shows one page.
  const stats = await Attendance.aggregate([{ $match: range }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
  const countOf = (status: string) => Number(stats.find((item) => item._id === status)?.count ?? 0);
  const present = countOf("present");
  const late = countOf("late");
  const absent = countOf("absent");
  const leave = countOf("leave");
  const holidays = countOf("holiday");
  const counted = present + late + absent + leave;
  const average = counted ? Math.round(((present + late) / counted) * 100) : 0;
  const records = await Attendance.find(range).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).lean();

  return <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10"><div className="mx-auto max-w-5xl"><a href="/student" className="text-sm font-medium text-blue-600">← Student portal</a><h1 className="mt-6 text-3xl font-bold">Attendance</h1><p className="mt-2 text-slate-500">Your attendance for the latest twelve months. Unmarked days are excluded from the average.</p><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Average</p><p className="mt-2 text-3xl font-bold text-blue-700">{average}%</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Present</p><p className="mt-2 text-3xl font-bold text-emerald-600">{present}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Late</p><p className="mt-2 text-3xl font-bold">{late}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Absent</p><p className="mt-2 text-3xl font-bold text-red-600">{absent}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Holidays</p><p className="mt-2 text-3xl font-bold">{holidays}</p></div></div><section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="border-b border-slate-100 px-6 py-4"><h2 className="font-semibold">Daily records</h2><p className="mt-1 text-sm text-slate-500">Leave days: {leave}. Holidays are not counted as absent.</p></div>{records.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Class</th><th className="px-6 py-4">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{records.map((record) => <tr key={String(record._id)}><td className="px-6 py-4">{new Date(record.date).toLocaleDateString()}</td><td className="px-6 py-4">{record.classSection}</td><td className="px-6 py-4 capitalize">{record.status}</td></tr>)}</tbody></table></div> : <div className="px-6 py-20 text-center text-sm text-slate-400">No attendance records available.</div>}<div className="border-t border-slate-100 px-6 py-4">{records.length > 0 && <Pagination page={page} pages={pages} hrefFor={(target) => (target > 1 ? `/student/attendance?page=${target}` : "/student/attendance")} />}</div></section></div></main>;
}
