import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection } from "@/Models";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const classes = await ClassSection.find({ isActive: true }).sort({ className: 1, sectionName: 1 }).lean();
  return <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10"><div className="mx-auto max-w-7xl"><a href="/dashboard" className="text-sm font-medium text-blue-600">← Back to dashboard</a><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Academic structure</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Classes & sections</h1><p className="mt-2 text-slate-500">Create the groups used by students, teachers, and attendance.</p></div><a href="/dashboard/classes/new" className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-500">Create class</a></div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{classes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center sm:col-span-2 lg:col-span-3"><p className="font-semibold text-slate-700">No classes yet</p><p className="mt-1 text-sm text-slate-400">Create your first class and section.</p></div> : classes.map((item) => <div key={String(item._id)} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-2xl font-bold">{item.className}-{item.sectionName}</p><p className="mt-2 text-sm text-slate-500">Academic year {item.academicYear}</p></div><span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{item.currentStrength}/{item.capacity}</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, (item.currentStrength / item.capacity) * 100)}%` }} /></div><p className="mt-2 text-xs text-slate-400">students enrolled</p></div>)}</div></div></main>;
}
