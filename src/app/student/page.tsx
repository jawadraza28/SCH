import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Fee, Homework, Notice, Result, Student, StudentBehavior } from "@/Models";

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

  let summaryStatus = "Improving";
  let summaryTone = "bg-amber-100 text-amber-800 border-amber-200";
  let summaryText = "Keep working steadily to build stronger habits.";

  if (student) {
    const [attendanceRows, previousAttendanceRows, recentResults, previousResults, behaviorRecords] = await Promise.all([
      Attendance.aggregate([
        {
          $match: {
            student: student._id,
            date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: "$status",
            total: { $sum: 1 },
          },
        },
      ]),
      Attendance.aggregate([
        {
          $match: {
            student: student._id,
            date: {
              $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
              $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: "$status",
            total: { $sum: 1 },
          },
        },
      ]),
      Result.find({ student: student._id }).sort({ createdAt: -1 }).limit(12).lean(),
      Result.find({ student: student._id, createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }).sort({ createdAt: -1 }).limit(12).lean(),
      StudentBehavior.find({ student: student._id }).sort({ observedAt: -1 }).limit(3).lean(),
    ]);

    const currentAttendanceMarked = attendanceRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
    const previousAttendanceMarked = previousAttendanceRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
    const attendanceGrade = currentAttendanceMarked
      ? Math.round((attendanceRows.reduce((sum, row) => sum + ((row._id === "present" || row._id === "late") ? Number(row.total ?? 0) : 0), 0) / currentAttendanceMarked) * 100)
      : 0;
    const previousAttendanceGrade = previousAttendanceMarked
      ? Math.round((previousAttendanceRows.reduce((sum, row) => sum + ((row._id === "present" || row._id === "late") ? Number(row.total ?? 0) : 0), 0) / previousAttendanceMarked) * 100)
      : 0;

    const resultAverage = recentResults.length ? Math.round(recentResults.reduce((sum, result) => sum + Number(result.percentage ?? 0), 0) / recentResults.length) : 0;
    const previousResultAverage = previousResults.length ? Math.round(previousResults.reduce((sum, result) => sum + Number(result.percentage ?? 0), 0) / previousResults.length) : 0;
    const attendanceTrendDown = previousAttendanceMarked > 0 && attendanceGrade < previousAttendanceGrade - 10;
    const marksTrendDown = previousResults.length > 0 && resultAverage < previousResultAverage - 10;
    const homeworkCompletion = Math.min(100, Math.round((homeworkCount ? 100 : 60) * 0.8 + (resultAverage * 0.2)));
    const behaviorRatingMap = { excellent: 90, improving: 70, needs_attention: 35 } as const;
    const behaviorRating = (behaviorRecords[0]?.rating ?? "improving") as keyof typeof behaviorRatingMap;
    const behaviorScore = behaviorRatingMap[behaviorRating];
    const overall = Math.round(attendanceGrade * 0.35 + resultAverage * 0.35 + homeworkCompletion * 0.15 + behaviorScore * 0.15);
    const fallingBoth = attendanceTrendDown && marksTrendDown;

    if (fallingBoth || overall < 50) {
      summaryStatus = "Needs Attention";
      summaryTone = "bg-rose-100 text-rose-800 border-rose-200";
      summaryText = fallingBoth
        ? "Attendance and marks are both falling. This student needs intervention and close monitoring."
        : "This learner is below the expected range and needs targeted support.";
    } else if (overall >= 80 || (!attendanceTrendDown && !marksTrendDown && overall >= 65)) {
      summaryStatus = "Excellent";
      summaryTone = "bg-emerald-100 text-emerald-800 border-emerald-200";
      summaryText = "This student is performing strongly and maintaining steady progress.";
    } else {
      summaryStatus = "Improving";
      summaryTone = "bg-amber-100 text-amber-800 border-amber-200";
      summaryText = "Good progress overall, but a few targeted improvements will strengthen the trend.";
    }
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Student portal</p><h1 className="mt-2 text-2xl sm:text-3xl font-bold">Welcome, {session.user.name}</h1><p className="mt-2 text-slate-500">Your learning information, all in one place.</p></header>
        <section className="mt-8 rounded-3xl bg-blue-700 p-7 text-white"><p className="text-sm text-blue-200">Student profile</p><h2 className="mt-2 text-2xl font-bold">{student?.fullName ?? session.user.name}</h2><p className="mt-2 text-blue-100">{student ? `${student.class}-${student.section} · Roll number ${student.rollNumber}` : "Your profile is being prepared by the school."}</p></section>
        <section className={`mt-7 rounded-2xl border p-5 shadow-sm ${summaryTone}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Student progress</p>
              <h2 className="mt-2 text-xl font-bold">{summaryStatus}</h2>
            </div>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">Combined overview</span>
          </div>
          <p className="mt-3 text-sm">{summaryText}</p>
        </section>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Attendance records", attendanceCount, "/student/attendance"], ["Homework", homeworkCount, "/student/homework"], ["Results", resultCount, "/student/results"], ["Fee records", feeCount, "/student/fees"]].map(([label, count, href]) => <Link key={String(label)} href={String(href)} className="rounded-2xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl sm:text-3xl font-bold">{count}</p><p className="mt-2 text-xs text-blue-600">Open {String(label).toLowerCase()} →</p></Link>)}</div>
        <section className="mt-7 rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">School notices</h2><a href="/student/notices" className="text-sm font-medium text-blue-600">View all</a></div>{notices.length ? <div className="mt-4 space-y-3">{notices.map((notice) => <article key={String(notice._id)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{notice.type}</p><h3 className="mt-1 font-semibold">{notice.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-500">{notice.description}</p></article>)}</div> : <p className="mt-10 text-center text-sm text-slate-400">No notices available.</p>}</section>
      </div>
    </main>
  );
}
