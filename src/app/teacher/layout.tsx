import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppNav, { type NavItem } from "@/components/AppNav";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";

export const dynamic = "force-dynamic";

/** Teacher shell: same responsive menu as the admin panel (see AppNav). */
const navigation: NavItem[] = [
  { label: "Overview", href: "/teacher", exact: true, quick: true },
  { label: "My profile", href: "/teacher/profile", exact: true },
  { label: "My students", href: "/teacher/students", quick: true },
  { label: "Mark attendance", href: "/teacher/attendance", exact: true, quick: true },
  {
    label: "Timetable",
    href: "/teacher/timetable",
    children: [
      { label: "Class timetable", href: "/teacher/timetable", exact: true },
      { label: "Exam timetable", href: "/teacher/exams", exact: true },
    ],
  },
  { label: "Exams", href: "/teacher/exams", exact: true },
  { label: "Homework", href: "/teacher/homework", exact: true, quick: true },
  { label: "Results", href: "/teacher/results", exact: true },
  { label: "Notices", href: "/teacher/notices", exact: true, quick: true },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "teacher") redirect(session.user.role === "student" ? "/student" : "/dashboard");
  await connectToDatabase();
  const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).select("schoolName logo").lean() : null;

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900">
      <AppNav items={navigation} userName={session.user.name} roleLabel={session.user.role} schoolName={school?.schoolName} schoolLogo={school?.logo || "/logo.png"} homeHref="/teacher" />
      <div className="lg:pl-72 print:pl-0">{children}</div>
    </div>
  );
}
