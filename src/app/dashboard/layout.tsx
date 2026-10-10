import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppNav, { type NavItem } from "@/components/AppNav";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";

export const dynamic = "force-dynamic";

/**
 * Admin shell. The menu lives here — once — so every admin screen gets the same
 * side rail (desktop) or hamburger drawer (mobile/tablet) without repeating it.
 * NOTE: the Attendance tab was removed from this list; teachers still mark
 * attendance from their own workspace.
 */
const navigation: NavItem[] = [
  { label: "Overview", href: "/dashboard", exact: true, quick: true },
  { label: "Analytics", href: "/dashboard/analytics", exact: true },
  {
    label: "Finance",
    href: "/dashboard/finance",
    exact: true,
    quick: true,
    children: [
      { label: "Overview & charts", href: "/dashboard/finance", exact: true },
      { label: "Custom income", href: "/dashboard/finance?tab=income" },
      { label: "Custom expense", href: "/dashboard/finance?tab=expenses" },
      { label: "Teacher salary", href: "/dashboard/finance?tab=salaries" },
    ],
  },
  {
    label: "Exams",
    href: "/dashboard/exams",
    children: [
      { label: "Exam timetable", href: "/dashboard/exams", exact: true },
      { label: "Exam terms & settings", href: "/dashboard/exams?view=terms" },
      { label: "Exam seating", href: "/dashboard/exam-seating", exact: true },
      { label: "View results", href: "/dashboard/exams?view=results" },
    ],
  },
  {
    label: "Students",
    href: "/dashboard/students",
    quick: true,
    children: [
      { label: "All students", href: "/dashboard/students", exact: true },
      { label: "Add student", href: "/dashboard/students/new", exact: true },
      { label: "Student requests", href: "/dashboard/students/requests", exact: true },
      { label: "Promote students", href: "/dashboard/students/promote", exact: true },
    ],
  },
  {
    label: "Teachers",
    href: "/dashboard/teachers",
    quick: true,
    children: [
      { label: "All teachers", href: "/dashboard/teachers", exact: true },
      { label: "Teacher attendance", href: "/dashboard/teacher-attendance", exact: true },
      { label: "Teacher salary", href: "/dashboard/finance?tab=salaries" },
      { label: "Assign classes", href: "/dashboard/teachers/assign", exact: true },
    ],
  },
  {
    label: "Timetable",
    href: "/dashboard/timetable",
    children: [
      { label: "Class timetable", href: "/dashboard/timetable?scope=class" },
      { label: "Teacher timetable", href: "/dashboard/timetable?scope=teacher" },
      { label: "Exam timetable", href: "/dashboard/exams", exact: true },
    ],
  },
  {
    label: "Classes & sections",
    href: "/dashboard/classes",
    children: [
      { label: "All classes", href: "/dashboard/classes", exact: true },
      { label: "Add class", href: "/dashboard/classes/new", exact: true },
      { label: "Assign class to teacher", href: "/dashboard/teachers/assign", exact: true },
    ],
  },
  {
    label: "Fees",
    href: "/dashboard/fees",
    quick: true,
    children: [
      { label: "Fee overview", href: "/dashboard/fees", exact: true },
      { label: "Student fee discounts", href: "/dashboard/fees?tab=discounts" },
    ],
  },
  { label: "Notices", href: "/dashboard/notices", children: [
    { label: "Notice board", href: "/dashboard/notices", exact: true },
    { label: "WhatsApp message", href: "/dashboard/notices#whatsapp" },
  ] },
  {
    label: "School settings",
    href: "/dashboard/school-settings",
    exact: true,
    children: [
      { label: "Settings", href: "/dashboard/school-settings", exact: true },
      { label: "Landing page", href: "/dashboard/landing", exact: true },
    ],
  },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role === "teacher") redirect("/teacher");
  if (session.user.role === "student") redirect("/student");
  await connectToDatabase();
  const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).select("schoolName logo").lean() : null;

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900">
      <AppNav items={navigation} userName={session.user.name} roleLabel={session.user.role} schoolName={school?.schoolName} schoolLogo={school?.logo || "/logo.png"} homeHref="/dashboard" />
      <div className="lg:pl-72 print:pl-0">{children}</div>
    </div>
  );
}
