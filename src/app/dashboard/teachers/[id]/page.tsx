import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher, TeacherAttendance, User } from "@/Models";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";
import { signedR2Url } from "@/lib/object-storage";

export const dynamic = "force-dynamic";

export default async function AdminTeacherProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; status?: string; page?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const id = (await params).id;
  const teacher = await Teacher.findById(id).lean();
  if (!teacher) notFound();
  const user = await User.findOne({ role: "teacher", cnic: teacher.cnic }).select("email").lean();
  let teacherPhotoUrl = "";
  if (teacher.profilePhotoUrl?.startsWith("r2://")) {
    try {
      teacherPhotoUrl = await signedR2Url(teacher.profilePhotoUrl);
    } catch (error) {
      console.error("Unable to create teacher profile photo URL:", error);
    }
  }
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
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/dashboard/teachers" className="text-sm font-medium text-blue-600">← Teachers</Link>  <Link href="/dashboard/teacher-attendance" className="w-full rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white sm:w-auto">Mark attendance</Link></div><section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm"><div className="bg-blue-700 p-6 text-white sm:p-8"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">Teacher profile</p><div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/15 text-3xl font-bold ring-4 ring-white/10">{teacherPhotoUrl ? <img src={teacherPhotoUrl} alt={`${teacher.name} profile`} className="h-full w-full object-cover" /> : teacher.name.charAt(0).toUpperCase()}</div><div><h1 className="text-3xl font-bold">{teacher.name}</h1><p className="mt-2 text-blue-100">{teacher.subject || "Teaching faculty"} · {teacher.gender || "Gender not set"}</p></div></div></div><div className="grid gap-4 p-6 text-sm sm:grid-cols-2 sm:p-8"><p><span className="text-slate-500">Email:</span> {user?.email || "-"}</p><p><span className="text-slate-500">CNIC:</span> {teacher.cnic}</p><p><span className="text-slate-500">Phone:</span> {teacher.phone || "-"}</p><p><span className="text-slate-500">Status:</span> {teacher.accountStatus}</p></div></section><section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="border-b border-slate-100 p-4 sm:p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Records</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Attendance history</h2><p className="mt-1 text-sm text-slate-500">Narrow the records by date range or attendance status.</p></div>{(filters.from || filters.to || filters.status) && <Link href={`/dashboard/teachers/${id}`} className="text-sm font-semibold text-slate-500 hover:text-blue-700">Clear filters</Link>}</div><form method="get" className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From date<input type="date" name="from" defaultValue={filters.from} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To date<input type="date" name="to" defaultValue={filters.to} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status<select name="status" defaultValue={filters.status} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal capitalize text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">All statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option></select></label><div className="flex items-end"><button className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Apply filters</button></div></div></form></div>{attendance.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Day/date</th><th className="px-5 py-3">Month</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{attendance.map((record) => { const date = new Date(record.date); return <tr key={String(record._id)}><td className="px-5 py-3">{date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</td><td className="px-5 py-3">{date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td><td className="px-5 py-3 capitalize">{record.status}</td></tr>; })}</tbody></table>  </div> : <p className="p-10 text-center text-sm text-slate-400">No attendance records match this filter.</p>}{pages > 1 && <div className="border-t border-slate-100 px-5 py-4"><Pagination page={page} pages={pages} hrefFor={attendanceHref} /></div>}</section></div></main>;
}
