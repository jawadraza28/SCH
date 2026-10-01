import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";
import AttendanceManager from "./AttendanceManager";

export const dynamic = "force-dynamic";

export default async function TeacherAttendancePage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "teacher") redirect("/dashboard");
  await connectToDatabase();
  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
  const assignedClasses = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean) : [];
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><a href="/teacher" className="text-sm font-medium text-blue-600">← Teacher workspace</a><h1 className="mt-6 text-2xl sm:text-3xl font-bold tracking-tight">Mark attendance</h1><p className="mt-2 text-slate-500">All students in your assigned classes are loaded automatically. Search by name or filter by attendance status.</p><AttendanceManager assignedClasses={assignedClasses} /></div></main>;
}
