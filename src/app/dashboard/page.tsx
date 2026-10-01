import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, ClassSection, Fee, Student, Teacher } from "@/Models";

export const dynamic = "force-dynamic";

type StatCard = {
  label: string;
  value: number;
  hint: string;
  href: string;
  accent: string;
};

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

  const [studentCount, teacherCount, classCount, presentToday, absentToday, pendingCount, unpaidFees] = await Promise.all([
    Student.countDocuments(),
    Teacher.countDocuments(),
    ClassSection.countDocuments({ isActive: true }),
    Attendance.countDocuments({ status: "present", date: { $gte: startOfDay, $lt: endOfDay } }),
    Attendance.countDocuments({ status: "absent", date: { $gte: startOfDay, $lt: endOfDay } }),
    Student.countDocuments({ accountStatus: "pending" }),
    Fee.countDocuments({ status: "unpaid" }),
  ]);

  const cards: StatCard[] = [
    { label: "Total students", value: studentCount, hint: "Search, filter and manage every student", href: "/dashboard/students", accent: "bg-blue-50 text-blue-600" },
    { label: "Total teachers", value: teacherCount, hint: "Staff records and class assignments", href: "/dashboard/teachers", accent: "bg-indigo-50 text-indigo-600" },
    { label: "Active classes", value: classCount, hint: "Sections that are currently running", href: "/dashboard/classes", accent: "bg-violet-50 text-violet-600" },
    { label: "Present today", value: presentToday, hint: `Students marked present on ${todayKey}`, href: `/dashboard/students?presentOn=${todayKey}`, accent: "bg-emerald-50 text-emerald-600" },
    { label: "Absent today", value: absentToday, hint: `Students marked absent on ${todayKey}`, href: "/dashboard/attendance", accent: "bg-rose-50 text-rose-600" },
    { label: "Pending requests", value: pendingCount, hint: "Student requests waiting for a decision", href: "/dashboard/students/requests", accent: "bg-amber-50 text-amber-600" },
    { label: "Unpaid fees", value: unpaidFees, hint: "Fee records still waiting for payment", href: "/dashboard/fees", accent: "bg-rose-50 text-rose-600" },
  ];

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
          <div className="rounded-3xl bg-blue-700 p-6 text-white shadow-lg shadow-blue-900/10 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200 sm:text-sm">School overview</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Everything important, at a glance.</h2>
            <p className="mt-2 max-w-xl text-sm text-blue-100 sm:text-base">Choose any card below to jump straight to that part of the school record.</p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Link key={card.label} href={card.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base font-bold ${card.accent}`}>→</span>
                </div>
                <p className="mt-3 text-2xl sm:text-3xl font-bold text-slate-900">{card.value}</p>
                <p className="mt-2 text-xs text-slate-400">{card.hint}</p>
                <p className="mt-3 text-xs font-semibold text-blue-600 group-hover:underline">Open</p>
              </Link>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Link href="/dashboard/students/new" className="rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-4 text-sm font-semibold text-blue-700 transition hover:-translate-y-0.5 hover:bg-blue-50">+ Add student<span className="mt-1 block text-xs font-normal text-blue-600/70">Create a new school record</span></Link><Link href="/dashboard/teachers/new" className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-4 text-sm font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:bg-emerald-50">+ Add teacher<span className="mt-1 block text-xs font-normal text-emerald-600/70">Create a faculty account</span></Link><Link href="/dashboard/classes/new" className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-4 text-sm font-semibold text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-50">+ Add class<span className="mt-1 block text-xs font-normal text-violet-600/70">Open a new section</span></Link><Link href="/dashboard/notices" className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4 text-sm font-semibold text-amber-700 transition hover:-translate-y-0.5 hover:bg-amber-50">+ Post notice<span className="mt-1 block text-xs font-normal text-amber-600/70">Share a school update</span></Link></div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent activity</h3>
              <span className="text-sm text-slate-400">This week</span>
            </div>
            <div className="mt-10 text-center sm:mt-12">
              <p className="font-medium text-slate-700">Your activity feed will appear here</p>
              <p className="mt-1 text-sm text-slate-400">Start by adding your first school records.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
