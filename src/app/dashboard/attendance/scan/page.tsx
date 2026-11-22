import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import AttendanceQrScanner from "@/components/AttendanceQrScanner";
import { getCurrentUser } from "@/lib/auth";

export default async function AttendanceScanPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <BackLink href="/dashboard/attendance" />
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl">QR attendance scanner</h1>
        <p className="mt-2 text-slate-500">Scan a student’s printed ID card to record their arrival automatically.</p>
        <AttendanceQrScanner />
      </div>
    </main>
  );
}
