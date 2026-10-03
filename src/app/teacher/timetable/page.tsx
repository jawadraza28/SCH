import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";
import TeacherTimetableWorkspace from "@/components/TeacherTimetableWorkspace";

export default async function TeacherTimetablePage() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "teacher") redirect("/teacher");
  await connectToDatabase();
  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).select("_id").lean();
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><h1 className="text-2xl font-bold sm:text-3xl">My timetable</h1><p className="mt-2 text-slate-500">View your administrator-assigned timetable and manage timetables for your assigned classes.</p>{teacher && <TeacherTimetableWorkspace teacherId={String(teacher._id)} />}</div></main>;
}
