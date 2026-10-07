import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ExamTimetableWorkspace from "@/components/ExamTimetableWorkspace";

export default async function StudentExamsPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "student") redirect("/student");
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><h1 className="text-2xl font-bold sm:text-3xl">Exam timetable</h1><p className="mt-2 text-slate-500">Open a term to view dates, subjects, times, and rooms.</p><ExamTimetableWorkspace mode="view" /></div></main>;
}
