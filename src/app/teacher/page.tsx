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
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Teacher workspace</p><h1 className="mt-2 text-2xl sm:text-3xl font-bold">Welcome, {session.user.name}</h1><p className="mt-2 text-slate-500">Your assigned classes, students, and daily teaching work.</p></div><a href="/api/auth/logout" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Sign out</a></header>
        <div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Assigned classes</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{classes.length}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">My students</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{studentCount}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Active homework</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{homeworkCount}</p></div></div>
        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="font-semibold">My classes</h2>{classes.length ? <div className="mt-4 flex flex-wrap gap-2">{classes.map((item) => <span key={item} className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">{item}</span>)}</div> : <p className="mt-10 text-center text-sm text-slate-400">No classes have been assigned yet.</p>}</section>
          <section className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">School notices</h2><a href="/teacher/notices" className="text-sm font-medium text-blue-600">View all</a></div>{notices.length ? <div className="mt-4 space-y-3">{notices.map((notice) => <article key={String(notice._id)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{notice.type}</p><h3 className="mt-1 font-semibold">{notice.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-500">{notice.description}</p></article>)}</div> : <p className="mt-10 text-center text-sm text-slate-400">No notices available.</p>}</section>
        </div>
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm"><h2 className="font-semibold">Teaching tools</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><a href="/teacher/students" className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">My students</a><a href="/teacher/attendance" className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">Mark attendance</a><a href="/teacher/homework" className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">Create homework</a><a href="/teacher/results" className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">Enter results</a></div></section>
      </div>
    </main>
  );
}
