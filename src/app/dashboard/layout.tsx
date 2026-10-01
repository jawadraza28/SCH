import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppNav, { type NavItem } from "@/components/AppNav";

export const dynamic = "force-dynamic";

/**
 * Admin shell. The menu lives here — once — so every admin screen gets the same
 * side rail (desktop) or hamburger drawer (mobile/tablet) without repeating it.
 * NOTE: the Attendance tab was removed from this list; teachers still mark
 * attendance from their own workspace.
 */
const navigation: NavItem[] = [
  { label: "Overview", href: "/dashboard", exact: true },
  { label: "Students", href: "/dashboard/students" },
  { label: "Teachers", href: "/dashboard/teachers" },
  { label: "Assign classes", href: "/dashboard/teachers/assign", exact: true },
  { label: "Classes & sections", href: "/dashboard/classes" },
  { label: "Fees", href: "/dashboard/fees" },
  { label: "Notices", href: "/dashboard/notices" },
  { label: "Student requests", href: "/dashboard/students/requests", exact: true },
  { label: "Audit history", href: "/dashboard/audit" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role === "teacher") redirect("/teacher");
  if (session.user.role === "student") redirect("/student");

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900">
      <AppNav items={navigation} userName={session.user.name} roleLabel={session.user.role} homeHref="/dashboard" />
      <div className="lg:pl-72 print:pl-0">{children}</div>
    </div>
  );
}
