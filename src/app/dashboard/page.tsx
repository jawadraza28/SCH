import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, ClassSection, Student, Teacher } from "@/Models";

export const dynamic = "force-dynamic";

const navigation = [
  ["Overview", "/dashboard"],
  ["Students", "/dashboard/students"],
  ["Teachers", "/dashboard/teachers"],
  ["Assign classes", "/dashboard/teachers/assign"],
  ["Classes & sections", "/dashboard/classes"],
  ["Attendance", "/dashboard/attendance"],
  ["Fees", "/dashboard/fees"],
  ["Notices", "/dashboard/notices"],
  ["Student requests", "/dashboard/students/requests"],
  ["Audit history", "/dashboard/audit"],
];

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
  const [studentCount, teacherCount, classCount, presentToday, pendingCount] = await Promise.all([
    Student.countDocuments(),
    Teacher.countDocuments(),
    ClassSection.countDocuments({ isActive: true }),
    Attendance.countDocuments({ status: "present", date: { $gte: startOfDay, $lt: endOfDay } }),
    Student.countDocuments({ accountStatus: "pending" }),
  ]);
  const cards = [
    ["Total students", studentCount],
    ["Total teachers", teacherCount],
    ["Active classes", classCount],
    ["Present today", presentToday],
    ["Pending requests", pendingCount],
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-6 py-7 lg:block">
        <div className="flex items-center gap-3 text-sm font-bold tracking-wide text-slate-800"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg text-white">S</span>SCHOOL OS</div>
        <div className="mt-12 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Signed in as</p><p className="mt-2 truncate font-semibold">{session.user.name}</p><p className="mt-1 text-sm capitalize text-slate-500">{session.user.role}</p></div>
        <nav className="mt-8 space-y-1" aria-label="Main navigation">{navigation.map(([label, href], index) => <a key={href} href={href} className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${index === 0 ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>{label}</a>)}</nav>
      </aside>
      <main className="lg:pl-72">
        <div className="border-b border-slate-200 bg-white px-6 py-3 lg:hidden"><nav className="flex gap-2 overflow-x-auto" aria-label="Mobile navigation">{navigation.map(([label, href]) => <a key={href} href={href} className="whitespace-nowrap rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">{label}</a>)}</nav></div>
        <header className="border-b border-slate-200 bg-white px-6 py-5 sm:px-10"><div className="mx-auto flex max-w-7xl items-center justify-between"><div><p className="text-sm font-medium text-blue-600">Tuesday, September 29, 2026</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Good morning, {session.user.name.split(" ")[0]}</h1></div><a href="/api/auth/logout" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Sign out</a></div></header>
        <section className="mx-auto max-w-7xl px-6 py-8 sm:px-10"><div className="rounded-3xl bg-blue-700 p-7 text-white shadow-lg shadow-blue-900/10 sm:p-9"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">School overview</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Everything important, at a glance.</h2><p className="mt-2 max-w-xl text-blue-100">Your school workspace is ready. Add students, teachers, and classes to begin building today’s picture.</p></div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold text-slate-900">{value}</p><p className="mt-2 text-xs text-slate-400">Live from MongoDB</p></div>)}</div>
          <div className="mt-7 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-semibold">Recent activity</h3><span className="text-sm text-slate-400">This week</span></div><div className="mt-12 text-center"><p className="font-medium text-slate-700">Your activity feed will appear here</p><p className="mt-1 text-sm text-slate-400">Start by adding your first school records.</p></div></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="font-semibold">Quick actions</h3><div className="mt-5 space-y-2"><Link href="/dashboard/students/requests" className="block rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100">Review student requests</Link><Link href="/dashboard/teachers/new" className="block rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">Add a teacher</Link><Link href="/dashboard/classes/new" className="block rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">Create a class</Link></div></div></div>
        </section>
      </main>
    </div>
  );
}