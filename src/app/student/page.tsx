import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Fee, Homework, Notice, Result, Student } from "@/Models";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  const attendanceCount = student ? await Attendance.countDocuments({ student: student._id }) : 0;
  const homeworkCount = student ? await Homework.countDocuments({ assignedToClass: student.class, assignedToSection: student.section, isActive: true }) : 0;
  const resultCount = student ? await Result.countDocuments({ student: student._id }) : 0;
  const feeCount = student ? await Fee.countDocuments({ student: student._id }) : 0;
  const notices = await Notice.find({ published: true, $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: new Date() } }] }).sort({ publishDate: -1 }).limit(3).lean();

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Student portal</p><h1 className="mt-2 text-2xl sm:text-3xl font-bold">Welcome, {session.user.name}</h1><p className="mt-2 text-slate-500">Your learning information, all in one place.</p></header>
        <section className="mt-8 rounded-3xl bg-blue-700 p-7 text-white"><p className="text-sm text-blue-200">Student profile</p><h2 className="mt-2 text-2xl font-bold">{student?.fullName ?? session.user.name}</h2><p className="mt-2 text-blue-100">{student ? `${student.class}-${student.section} · Roll number ${student.rollNumber}` : "Your profile is being prepared by the school."}</p></section>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Attendance records", attendanceCount], ["Homework", homeworkCount], ["Results", resultCount], ["Fee records", feeCount]].map(([label, count]) => <div key={String(label)} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{count}</p><p className="mt-2 text-xs text-slate-400">Available in the navigation tabs</p></div>)}</div>
        <section className="mt-7 rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">School notices</h2><a href="/student/notices" className="text-sm font-medium text-blue-600">View all</a></div>{notices.length ? <div className="mt-4 space-y-3">{notices.map((notice) => <article key={String(notice._id)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{notice.type}</p><h3 className="mt-1 font-semibold">{notice.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-500">{notice.description}</p></article>)}</div> : <p className="mt-10 text-center text-sm text-slate-400">No notices available.</p>}</section>
      </div>
    </main>
  );
}
