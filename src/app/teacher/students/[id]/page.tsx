import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Fee, Student, Teacher } from "@/Models";

export const dynamic = "force-dynamic";

export default async function TeacherStudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "teacher") redirect(session.user?.role === "student" ? "/student" : "/dashboard");
  await connectToDatabase();
  const [teacher, student] = await Promise.all([
    Teacher.findOne({ cnic: session.user.cnic }).select("assignedClasses").lean(),
    Student.findById((await params).id).lean(),
  ]);
  if (!student) notFound();
  const assignedClasses = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item).toUpperCase()) : [];
  if (!assignedClasses.includes(`${student.class}-${student.section}`.toUpperCase())) redirect("/teacher/students");
  const [fees, attendance] = await Promise.all([
    Fee.find({ student: student._id }).sort({ year: -1, month: -1 }).limit(12).lean(),
    Attendance.find({ student: student._id }).sort({ date: -1 }).limit(365).lean(),
  ]);
  const present = attendance.filter((item) => item.status === "present").length;
  const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;

  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><Link href="/teacher/students" className="text-sm font-medium text-blue-600">← My students</Link><section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm"><div className="bg-blue-700 p-7 text-white sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Student profile</p><div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl bg-white/15 text-3xl font-bold">{student.profilePhotoUrl ? <img src={`/api/students/${String(student._id)}/photo`} alt="Student" className="h-full w-full object-cover" /> : student.fullName.charAt(0)}</div><div><h1 className="text-2xl font-bold sm:text-3xl">{student.fullName}</h1><p className="mt-2 text-blue-100">{student.studentId} · Class {student.class}-{student.section} · Roll {student.rollNumber}</p></div></div></div><div className="grid gap-6 p-7 sm:grid-cols-2"><div><h2 className="font-semibold">Student information</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">CNIC</dt><dd>{student.cnic || "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Gender</dt><dd className="capitalize">{student.gender || "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Parent phone</dt><dd>{student.fatherPhone || student.motherPhone || "-"}</dd></div></dl></div><div><h2 className="font-semibold">Attendance snapshot</h2><p className="mt-4 text-3xl font-bold text-blue-700">{attendanceRate}%</p><p className="mt-1 text-sm text-slate-500">{present} present of {attendance.length} recorded days</p></div></div></section><div className="mt-6 space-y-4"><details className="group rounded-2xl bg-white shadow-sm"><summary className="cursor-pointer list-none px-6 py-5 font-semibold">Fees <span className="float-right text-sm font-normal text-slate-400 group-open:hidden">View details +</span><span className="float-right hidden text-sm font-normal text-slate-400 group-open:inline">Hide details -</span></summary><div className="overflow-x-auto border-t border-slate-100 px-6 py-4"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3">Month</th><th className="py-3">Amount</th><th className="py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{fees.map((fee) => <tr key={String(fee._id)}><td className="py-3">{fee.month} {fee.year}</td><td className="py-3">{fee.amount}</td><td className="py-3 capitalize">{fee.status}</td></tr>)}</tbody></table>{fees.length === 0 && <p className="py-6 text-sm text-slate-400">No fee records available.</p>}</div></details><details className="group rounded-2xl bg-white shadow-sm"><summary className="cursor-pointer list-none px-6 py-5 font-semibold">Attendance history <span className="float-right text-sm font-normal text-slate-400 group-open:hidden">View details +</span><span className="float-right hidden text-sm font-normal text-slate-400 group-open:inline">Hide details -</span></summary><div className="overflow-x-auto border-t border-slate-100 px-6 py-4"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3">Date</th><th className="py-3">Class</th><th className="py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{attendance.map((record) => <tr key={String(record._id)}><td className="py-3">{new Date(record.date).toLocaleDateString()}</td><td className="py-3">{record.classSection}</td><td className="py-3 capitalize">{record.status}</td></tr>)}</tbody></table>{attendance.length === 0 && <p className="py-6 text-sm text-slate-400">No attendance records available.</p>}</div></details></div></div></main>;
}
