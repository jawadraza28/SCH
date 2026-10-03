import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppNav, { type NavItem } from "@/components/AppNav";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";

export const dynamic = "force-dynamic";

/** Student shell: same responsive menu as the admin panel (see AppNav). */
const navigation: NavItem[] = [
  { label: "Overview", href: "/student", exact: true },
  { label: "My profile", href: "/student/profile", exact: true },
  { label: "Attendance", href: "/student/attendance", exact: true },
  { label: "Class timetable", href: "/student/timetable", exact: true },
  { label: "Homework", href: "/student/homework", exact: true },
  { label: "Results", href: "/student/results", exact: true },
  { label: "Fees", href: "/student/fees", exact: true },
  { label: "Notices", href: "/student/notices", exact: true },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect(session.user.role === "teacher" ? "/teacher" : "/dashboard");
  await connectToDatabase();
  const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).select("schoolName logo").lean() : null;

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900">
      <AppNav items={navigation} userName={session.user.name} roleLabel={session.user.role} schoolName={school?.schoolName} schoolLogo="/logo.png" homeHref="/student" />
      <div className="lg:pl-72 print:pl-0">{children}</div>
    </div>
  );
}
