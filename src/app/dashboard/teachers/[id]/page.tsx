import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher, TeacherAttendance, User } from "@/Models";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function AdminTeacherProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; status?: string; page?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const id = (await params).id;
  const teacher = await Teacher.findById(id).lean();
  if (!teacher) notFound();
  const user = await User.findOne({ role: "teacher", cnic: teacher.cnic }).select("email").lean();
  const filters = await searchParams;
  const query: Record<string, unknown> = { teacher: teacher._id };
  if (filters.status && ["present", "absent", "late", "leave"].includes(filters.status)) query.status = filters.status;
  if (filters.from || filters.to) {
    query.date = { ...(filters.from ? { $gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}), ...(filters.to ? { $lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}) };
  }
  const totalAttendance = await TeacherAttendance.countDocuments(query);
  const pages = countPages(totalAttendance, DEFAULT_PAGE_SIZE);
  const page = clampPage(parsePageNumber(filters.page), pages);
  const attendance = await TeacherAttendance.find(query).sort({ date: -1 }).skip((page - 1) * DEFAULT_PAGE_SIZE).limit(DEFAULT_PAGE_SIZE).lean();
  function attendanceHref(target: number) {
    const next = new URLSearchParams();
    if (filters.from) next.set("from", filters.from);
    if (filters.to) next.set("to", filters.to);
    if (filters.status) next.set("status", filters.status);
    if (target > 1) next.set("page", String(target));
    return `/dashboard/teachers/${id}?${next}`;
  }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/dashboard/teachers" className="text-sm font-medium text-blue-600">← Teachers</Link>  <Link href="/dashboard/teacher-attendance" className="w-full rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white sm:w-auto">Mark attendance</Link></div><section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm"><div className="bg-blue-700 p-8 text-white"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">Teacher profile</p><h1 className="mt-3 text-3xl font-bold">{teacher.name}</h1><p className="mt-2 text-blue-100">{teacher.subject || "Teaching faculty"} · {teacher.gender || "Gender not set"}</p></div><div className="grid gap-4 p-8 text-sm sm:grid-cols-2"><p><span className="text-slate-500">Email:</span> {user?.email || "-"}</p><p><span className="text-slate-500">CNIC:</span> {teacher.cnic}</p><p><span className="text-slate-500">Phone:</span> {teacher.phone || "-"}</p><p><span className="text-slate-500">Status:</span> {teacher.accountStatus}</p></div></section><section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold">Attendance history</h2><form method="get" className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><label className="text-sm font-medium">From<input type="date" name="from" defaultValue={filters.from} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-medium">To<input type="date" name="to" defaultValue={filters.to} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-medium">Status<select name="status" defaultValue={filters.status} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="">All statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option></select></label><button className="self-end rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Filter</button></form></div>{attendance.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Day/date</th><th className="px-5 py-3">Month</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{attendance.map((record) => { const date = new Date(record.date); return <tr key={String(record._id)}><td className="px-5 py-3">{date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</td><td className="px-5 py-3">{date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td><td className="px-5 py-3 capitalize">{record.status}</td></tr>; })}</tbody></table>  </div> : <p className="p-10 text-center text-sm text-slate-400">No attendance records match this filter.</p>}{pages > 1 && <div className="border-t border-slate-100 px-5 py-4"><Pagination page={page} pages={pages} hrefFor={attendanceHref} /></div>}</section></div></main>;
}
