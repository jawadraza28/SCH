import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ExamTimetableWorkspace from "@/components/ExamTimetableWorkspace";

export default async function AdminExamsPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-7xl"><h1 className="text-2xl font-bold sm:text-3xl">Exams &amp; timetable</h1><p className="mt-2 text-slate-500">Create terms and publish a date sheet for each class.</p><ExamTimetableWorkspace mode="manage" canCreateTerms /></div></main>;
}
