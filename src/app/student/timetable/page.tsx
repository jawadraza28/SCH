import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student } from "@/Models";
import TimetableEditor from "@/components/TimetableEditor";

export default async function StudentTimetablePage() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "student") redirect("/student");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).select("class section").lean();
  const target = student ? `${student.class}-${student.section}`.toUpperCase() : "";
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><h1 className="text-2xl font-bold sm:text-3xl">Class timetable</h1><p className="mt-2 text-slate-500">Your teacher and school schedule for class {target || "your class"}.</p>{target ? <TimetableEditor scope="class" target={target} readOnly /> : <p className="mt-6 rounded-2xl bg-white p-8 text-sm text-slate-500">Your class has not been assigned yet.</p>}</div></main>;
}
