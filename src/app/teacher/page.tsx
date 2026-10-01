import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Homework, Notice, Student, Teacher } from "@/Models";

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "teacher") redirect("/dashboard");
  await connectToDatabase();
  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
  const classes: string[] = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item)) : [];
  const assignedClasses = classes.map((item) => item.toUpperCase());
  const studentCount = assignedClasses.length ? await Student.countDocuments({ $expr: { $in: [{ $toUpper: { $concat: ["$class", "-", "$section"] } }, assignedClasses] } }) : 0;
  const homeworkCount = teacher ? await Homework.countDocuments({ assignedBy: teacher._id, isActive: true }) : 0;
  const notices = await Notice.find({ published: true, $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: new Date() } }] }).sort({ publishDate: -1 }).limit(3).lean();

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Teacher workspace</p><h1 className="mt-2 text-2xl sm:text-3xl font-bold">Welcome, {session.user.name}</h1><p className="mt-2 text-slate-500">Your assigned classes, students, and daily teaching work.</p></header>
        <div className="mt-8 grid gap-4 sm:grid-cols-3"><Link href="/teacher/students" className="rounded-2xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><p className="text-sm text-slate-500">Assigned classes</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{classes.length}</p><p className="mt-2 text-xs font-semibold text-blue-600">Open students →</p></Link><Link href="/teacher/students" className="rounded-2xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><p className="text-sm text-slate-500">My students</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{studentCount}</p><p className="mt-2 text-xs font-semibold text-blue-600">View roster →</p></Link><Link href="/teacher/homework" className="rounded-2xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><p className="text-sm text-slate-500">Active homework</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{homeworkCount}</p><p className="mt-2 text-xs font-semibold text-blue-600">Manage homework →</p></Link></div>
        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="font-semibold">My classes</h2>{classes.length ? <div className="mt-4 flex flex-wrap gap-2">{classes.map((item) => <Link key={item} href={`/teacher/students?classSection=${encodeURIComponent(item)}`} className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">{item} →</Link>)}</div> : <p className="mt-10 text-center text-sm text-slate-400">No classes have been assigned yet.</p>}</section>
          <section className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">School notices</h2><a href="/teacher/notices" className="text-sm font-medium text-blue-600">View all</a></div>{notices.length ? <div className="mt-4 space-y-3">{notices.map((notice) => <article key={String(notice._id)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{notice.type}</p><h3 className="mt-1 font-semibold">{notice.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-500">{notice.description}</p></article>)}</div> : <p className="mt-10 text-center text-sm text-slate-400">No notices available.</p>}</section>
        </div>
        <section className="mt-7 rounded-2xl bg-slate-900 p-6 text-white shadow-sm sm:p-7"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Today's toolkit</p><h2 className="mt-2 text-xl font-bold">Keep the next action close.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Jump directly into the work that keeps your classes moving.</p></div><div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3"><Link href="/teacher/attendance" className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-500">Mark attendance</Link><Link href="/teacher/homework" className="rounded-xl bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/20">New homework</Link><Link href="/teacher/results" className="rounded-xl bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/20">Enter results</Link></div></div></section>
      </div>
    </main>
  );
}
