import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Homework, Result, Student, StudentBehavior } from "@/Models";

export const dynamic = "force-dynamic";

const ratingMeta = {
  excellent: {
    label: "Excellent",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  improving: {
    label: "Improving",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  needs_attention: {
    label: "Needs Attention",
    badge: "bg-rose-100 text-rose-800 border-rose-200",
  },
} as const;

export default async function StudentPerformancePage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");

  await connectToDatabase();

  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  if (!student) redirect("/student");

  const [attendanceRows, recentResults, behaviorRecords, homeworkRecords] = await Promise.all([
    Attendance.aggregate([
      {
        $match: {
          student: student._id,
          date: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
      },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]),
    Result.find({ student: student._id }).sort({ createdAt: -1 }).limit(10).populate("examTerm", "title").lean(),
    StudentBehavior.find({ student: student._id }).sort({ observedAt: -1 }).limit(5).populate("teacher", "name").lean(),
    Homework.find({ assignedToClass: student.class, assignedToSection: student.section, isActive: true }).sort({ dueDate: 1 }).limit(4).lean(),
  ]);

  const presentTotal = attendanceRows.reduce((sum, row) => sum + (row._id === "present" || row._id === "late" ? Number(row.total ?? 0) : 0), 0);
  const totalMarked = attendanceRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const attendanceRate = totalMarked ? Math.round((presentTotal / totalMarked) * 100) : 0;

  const averageMarks = recentResults.length
    ? Math.round(recentResults.reduce((sum, row) => sum + Number(row.percentage ?? 0), 0) / recentResults.length)
    : 0;

  const averageScore = recentResults.length
    ? Math.round(recentResults.reduce((sum, row) => sum + Number(row.obtainedMarks ?? 0), 0) / recentResults.length)
    : 0;

  const latestRating = (behaviorRecords[0]?.rating ?? "improving") as keyof typeof ratingMeta;
  const latestTeacher = behaviorRecords[0]?.teacher && typeof behaviorRecords[0].teacher === "object" && "name" in behaviorRecords[0].teacher
    ? String(behaviorRecords[0].teacher.name)
    : "Teacher";

  const overallSummary = attendanceRate >= 85 && averageMarks >= 70
    ? "Strong performance and consistent attendance. Keep sustaining the momentum."
    : attendanceRate >= 70 && averageMarks >= 55
      ? "Good progress overall. A few targeted improvements will push performance higher."
      : "Needs follow-up support. Please focus on attendance and subject practice to improve the trend.";

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/student" className="text-sm font-medium text-blue-600">← Student portal</Link>

        <header className="mt-6 rounded-3xl bg-blue-700 p-7 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Performance</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{student.fullName}</h1>
          <p className="mt-2 text-blue-100">
            {student.class}-{student.section} · Roll {student.rollNumber} · Attendance and academic progress at a glance
          </p>
        </header>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Attendance</p>
            <p className="mt-3 text-3xl font-bold text-blue-700">{attendanceRate}%</p>
            <p className="mt-2 text-xs text-slate-400">{totalMarked} marked records</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Average marks</p>
            <p className="mt-3 text-3xl font-bold text-emerald-600">{averageMarks}%</p>
            <p className="mt-2 text-xs text-slate-400">Across recent results</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Average scored</p>
            <p className="mt-3 text-3xl font-bold text-violet-600">{averageScore}</p>
            <p className="mt-2 text-xs text-slate-400">Marks obtained</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Current status</p>
            <p className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-sm font-semibold ${ratingMeta[latestRating].badge}`}>
              {ratingMeta[latestRating].label}
            </p>
            <p className="mt-2 text-xs text-slate-400">Latest teacher review</p>
          </div>
        </div>

        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Progress summary</p>
              <h2 className="mt-2 text-xl font-bold">Academic overview</h2>
            </div>
            <span className="text-sm text-slate-500">Updated from the last 90 days</span>
          </div>
          <p className="mt-4 text-sm text-slate-600">{overallSummary}</p>
        </section>

        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent results</h2>
              <Link href="/student/results" className="text-sm font-medium text-blue-600">View all</Link>
            </div>
            {recentResults.length === 0 ? (
              <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-400">No result records available yet.</div>
            ) : (
              <div className="mt-5 space-y-3">
                {recentResults.map((result) => (
                  <div key={String(result._id)} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{result.subject}</p>
                        <p className="text-xs text-slate-500">{typeof result.examTerm === "object" && result.examTerm ? String((result.examTerm as { title?: string }).title ?? "Exam") : "Exam"}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${result.result === "pass" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-rose-200 bg-rose-100 text-rose-700"}`}>
                        {result.result}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Score</p>
                        <p className="mt-1 font-bold">{Number(result.obtainedMarks ?? 0)}/{Number(result.totalMarks ?? 0)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Percentage</p>
                        <p className="mt-1 font-bold">{Number(result.percentage ?? 0)}%</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Passing</p>
                        <p className="mt-1 font-bold">{Number(result.passingMarks ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Teacher feedback</h2>
            {behaviorRecords.length === 0 ? (
              <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-400">No teacher feedback available yet.</div>
            ) : (
              <div className="mt-5 space-y-3">
                {behaviorRecords.map((record) => {
                  const teacherName = record.teacher && typeof record.teacher === "object" && "name" in record.teacher ? String(record.teacher.name) : "Teacher";
                  const rating = String(record.rating ?? "improving") as keyof typeof ratingMeta;
                  return (
                    <div key={String(record._id)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ratingMeta[rating].badge}`}>
                          {ratingMeta[rating].label}
                        </span>
                        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{teacherName}</span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{String(record.note ?? "No written note provided.")}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {new Date(record.observedAt ?? Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="mt-7 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Current homework</h2>
          {homeworkRecords.length === 0 ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-400">No active homework for this class section.</div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {homeworkRecords.map((item) => (
                <article key={String(item._id)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">{item.subject}</p>
                  <h3 className="mt-2 font-semibold text-slate-800">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{item.description || "No description provided."}</p>
                  <p className="mt-3 text-xs text-slate-400">
                    Due {new Date(item.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
