import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, ClassSection, Fee, Notice, Student, Teacher, TeacherAttendance } from "@/Models";
import { attendanceRate, todayStudentAttendance } from "@/lib/analytics";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TEXT_CLASS,
  formatCount,
} from "@/components/charts/palette";
import DonutChart from "@/components/charts/DonutChart";

export const dynamic = "force-dynamic";

type StatCard = {
  label: string;
  value: number;
  hint: string;
  href: string;
  accent: string;
  icon: "students" | "teachers" | "classes" | "present" | "absent" | "requests" | "fees" | "unmarked";
};

function CardIcon({ type }: { type: StatCard["icon"] }) {
  const paths = {
    students: "M5 19v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    teachers: "M12 4l8 4-8 4-8-4 8-4Zm-5 7v4c3 2 7 2 10 0v-4",
    classes: "M4 5h16v14H4zM8 9h8M8 13h5",
    present: "M5 12l4 4L19 6",
    absent: "M6 6l12 12M18 6 6 18",
    requests: "M6 4h12v16H6zM9 9h6M9 13h6M9 17h3",
    fees: "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4",
    unmarked: "M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  } as const;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]} /></svg>;
}

export default function DashboardPage() {
  return <DashboardContent />;
}

async function DashboardContent() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role === "teacher") redirect("/teacher");
  if (session.user.role === "student") redirect("/student");
  await connectToDatabase();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  // YYYY-MM-DD key that the students list expects in ?presentOn=, so the
  // "Present today" card opens the real student list already filtered to
  // today's register (advanced search, filters and pagination keep working).
  const todayKey = `${startOfDay.getFullYear()}-${String(startOfDay.getMonth() + 1).padStart(2, "0")}-${String(startOfDay.getDate()).padStart(2, "0")}`;
  const todayLabel = startOfDay.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const [studentCount, teacherCount, classCount, presentToday, absentToday, pendingCount, unpaidFees, teacherPresentToday, teacherAbsentToday, notices, registerToday] = await Promise.all([
    Student.countDocuments(),
    Teacher.countDocuments(),
    ClassSection.countDocuments({ isActive: true }),
    Attendance.countDocuments({ status: "present", date: { $gte: startOfDay, $lt: endOfDay } }),
    Attendance.countDocuments({ status: "absent", date: { $gte: startOfDay, $lt: endOfDay } }),
    Student.countDocuments({ accountStatus: "pending" }),
    Fee.countDocuments({ status: "unpaid" }),
    TeacherAttendance.countDocuments({ date: { $gte: startOfDay, $lt: endOfDay }, status: "present" }),
    TeacherAttendance.countDocuments({ date: { $gte: startOfDay, $lt: endOfDay }, status: "absent" }),
    Notice.find({ published: true, $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: new Date() } }] }).sort({ publishDate: -1 }).limit(4).select("title description type publishDate").lean(),
    todayStudentAttendance(new Date()),
  ]);

  const cards: StatCard[] = [
    { label: "Total students", value: studentCount, hint: "Search, filter and manage every student", href: "/dashboard/students", accent: "bg-blue-50 text-blue-600", icon: "students" },
    { label: "Total teachers", value: teacherCount, hint: "Staff records and class assignments", href: "/dashboard/teachers", accent: "bg-indigo-50 text-indigo-600", icon: "teachers" },
    { label: "Active classes", value: classCount, hint: "Sections that are currently running", href: "/dashboard/classes", accent: "bg-violet-50 text-violet-600", icon: "classes" },
    { label: "Present today", value: presentToday, hint: `Students marked present on ${todayKey}`, href: `/dashboard/students?presentOn=${todayKey}`, accent: "bg-emerald-50 text-emerald-600", icon: "present" },
    { label: "Absent today", value: absentToday, hint: `Students marked absent on ${todayKey}`, href: "/dashboard/attendance", accent: "bg-rose-50 text-rose-600", icon: "absent" },
    { label: "Unmarked attendance", value: registerToday.counts.unmarked, hint: `Students without attendance marked today`, href: "/dashboard/analytics/today?view=unmarked", accent: "bg-amber-50 text-amber-600", icon: "unmarked" },
    { label: "Pending requests", value: pendingCount, hint: "Student requests waiting for a decision", href: "/dashboard/students/requests", accent: "bg-amber-50 text-amber-600", icon: "requests" },
    { label: "Unpaid fees", value: unpaidFees, hint: "Fee records still waiting for payment", href: "/dashboard/fees", accent: "bg-rose-50 text-rose-600", icon: "fees" },
    { label: "Teachers present", value: teacherPresentToday, hint: `Teachers marked present on ${todayKey}`, href: `/dashboard/teacher-attendance?date=${todayKey}&status=present`, accent: "bg-emerald-50 text-emerald-600", icon: "present" },
    { label: "Teachers absent", value: teacherAbsentToday, hint: `Teachers marked absent on ${todayKey}`, href: `/dashboard/teacher-attendance?date=${todayKey}&status=absent`, accent: "bg-rose-50 text-rose-600", icon: "absent" },
  ];

  // The donut reuses the same aggregate that filled the cards above, so the
  // ring always adds up to the numbers printed on the cards.
  const registerRate = attendanceRate(registerToday.counts);

  return (
    <div className="app-page bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
          <div>
            <p className="text-xs font-medium text-blue-600 sm:text-sm">{todayLabel}</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Good morning, {session.user.name.split(" ")[0]}</h1>
          </div>
        </header>

        <section className="mt-5 sm:mt-7">
          <div className="dashboard-overview-hero relative overflow-hidden rounded-3xl bg-blue-700 p-6 text-white shadow-lg shadow-blue-900/10 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200 sm:text-sm">School overview</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Everything important, at a glance.</h2>
            <p className="mt-2 max-w-xl text-sm text-blue-100 sm:text-base">Choose any card below to jump straight to that part of the school record.</p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Link key={card.label} href={card.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${card.accent}`}><CardIcon type={card.icon} /></span>
                    <p className="text-sm text-slate-500">{card.label}</p>
                  </div>
                  <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base font-bold ${card.accent}`}>→</span>
                </div>
                <p className="mt-3 text-2xl sm:text-3xl font-bold text-slate-900">{card.value}</p>
                <p className="mt-2 text-xs text-slate-400">{card.hint}</p>
                <p className="mt-3 text-xs font-semibold text-blue-600 group-hover:underline">Open</p>
              </Link>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/dashboard/students/new" className="qa-card qa-card--blue">
              + Add student
              <span className="qa-card__hint">Create a new school record</span>
            </Link>
            <Link href="/dashboard/teachers/new" className="qa-card qa-card--emerald">
              + Add teacher
              <span className="qa-card__hint">Create a faculty account</span>
            </Link>
            <Link href="/dashboard/classes/new" className="qa-card qa-card--violet">
              + Add class
              <span className="qa-card__hint">Open a new section</span>
            </Link>
            <Link href="/dashboard/notices" className="qa-card qa-card--amber">
              + Post notice
              <span className="qa-card__hint">Share a school update</span>
            </Link>
          </div>

          {/* Today's register as a circle chart — the same numbers as the
              "Present / Absent today" cards above, split by every status. */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Today at a glance</p>
                <h3 className="mt-1 font-semibold">Student attendance circle</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {formatCount(registerToday.marked)} of {formatCount(registerToday.roster)} students marked · {registerRate}% attendance
                </p>
              </div>
              <Link href="/dashboard/analytics" className="text-sm font-semibold text-blue-600 hover:underline">See all analytics →</Link>
            </div>
            {registerToday.roster === 0 ? (
              <p className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                No students on the roster yet. Add students to see today&apos;s attendance circle.
              </p>
            ) : (
              <div className="mt-6">
                <DonutChart
                  slices={STATUS_ORDER.map((status) => ({
                    label: STATUS_LABEL[status],
                    value: registerToday.counts[status],
                    color: STATUS_COLOR[status],
                    textClass: STATUS_TEXT_CLASS[status],
                  }))}
                  centerLabel="Students"
                  centerHint={`${registerRate}% attended`}
                  size={210}
                  sliceHref={STATUS_ORDER.map((status) => status === "unmarked" ? "/dashboard/analytics/today?view=unmarked" : "/dashboard/analytics/today?view=present")}
                />
              </div>
            )}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">School updates</p><h3 className="mt-1 font-semibold">Notices you published</h3></div>
              <Link href="/dashboard/notices" className="text-sm font-semibold text-blue-600 hover:underline">Manage notices →</Link>
            </div>
            {notices.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{notices.map((notice) => <article key={String(notice._id)} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">{notice.type}</span><time className="text-xs text-slate-400">{new Date(notice.publishDate).toLocaleDateString()}</time></div><h4 className="mt-3 font-semibold text-slate-800">{notice.title}</h4><p className="mt-1 line-clamp-2 text-sm text-slate-500">{notice.description}</p></article>)}</div> : <p className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No notices published yet. Create your first school update.</p>}
          </section>
        </section>
      </div>
    </div>
  );
}
