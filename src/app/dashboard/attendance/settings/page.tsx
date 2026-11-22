import { redirect } from "next/navigation";
import AttendanceSettingsForm from "@/components/AttendanceSettingsForm";
import BackLink from "@/components/BackLink";
import { getCurrentUser } from "@/lib/auth";

export default async function AttendanceSettingsPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-3xl">
        <BackLink href="/dashboard/attendance/scan">Back to QR scanner</BackLink>
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Attendance settings</h1>
        <p className="mt-2 text-slate-500">Set your school day, late time, absence cutoff, and timezone.</p>
        <AttendanceSettingsForm />
      </div>
    </main>
  );
}
