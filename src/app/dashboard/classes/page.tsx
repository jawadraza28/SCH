import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Student } from "@/Models";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const classes = await ClassSection.find({ isActive: true }).sort({ className: 1, sectionName: 1 }).lean();
  // Live seat counts: strength is tallied from the student roster (not a stored
  // counter), so the number on each card is always the true number of students.
  const roster = await Student.find({ accountStatus: { $in: ["active", "pending"] } }).select("class section").lean();
  const strengthByClass = new Map<string, number>();
  for (const student of roster) {
    const key = `${student.class}-${student.section}`.toUpperCase();
    strengthByClass.set(key, (strengthByClass.get(key) ?? 0) + 1);
  }
  const strengthOf = (className: string, section: string) => strengthByClass.get(`${className}-${section}`.toUpperCase()) ?? 0;
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-7xl"><BackLink /><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Academic structure</p><h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">Classes & sections</h1><p className="mt-2 text-slate-500">Create groups and open any class to view its students.</p></div><a href="/dashboard/classes/new" className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-500">Create class</a></div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{classes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16 sm:px-6 sm:py-20 text-center sm:col-span-2 lg:col-span-3"><p className="font-semibold text-slate-700">No classes yet</p><p className="mt-1 text-sm text-slate-400">Create your first class and section.</p></div> : classes.map((item) => { const strength = strengthOf(item.className, item.sectionName); const full = Number(item.capacity) > 0 && strength >= Number(item.capacity); return <Link href={`/dashboard/students?className=${encodeURIComponent(item.className)}&section=${encodeURIComponent(item.sectionName)}`} key={String(item._id)} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><div className="flex items-start justify-between"><div><p className="text-2xl font-bold">{item.className}-{item.sectionName}</p><p className="mt-2 text-sm text-slate-500">Academic year {item.academicYear}</p></div><span className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${full ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{strength}/{item.capacity} seats{full ? " (full)" : ""}</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${full ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${item.capacity ? Math.min(100, (strength / Number(item.capacity)) * 100) : 0}%` }} /></div><div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>students enrolled</span><span className="font-semibold text-blue-600 group-hover:underline">View students →</span></div></Link>; })}</div></div></main>;
}
