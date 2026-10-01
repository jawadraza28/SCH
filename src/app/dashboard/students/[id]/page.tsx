import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Fee, SchoolConfiguration, Student } from "@/Models";
import { lastTwelveMonthsNewestFirst } from "@/lib/fees";
import FeeActions from "@/components/FeeActions";

export const dynamic = "force-dynamic";

export default async function AdminStudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findById((await params).id).lean();
  if (!student) notFound();

  const studentId = String(student._id);
  const [fees, attendance] = await Promise.all([
    Fee.find({ student: student._id }).lean(),
    Attendance.find({ student: student._id }).sort({ date: -1 }).limit(365).lean(),
  ]);
  const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).lean() : null;
  const monthlyFee = Number(school?.monthlyFee ?? 0);
  const feeByMonth = new Map(fees.map((fee) => [`${fee.month}-${fee.year}`, fee]));
  // Every student always shows the full one year window, most recent month first.
  const feeRows = lastTwelveMonthsNewestFirst().map((entry) => {
    const record = feeByMonth.get(entry.key);
    return {
      ...entry,
      amount: record?.amount ?? monthlyFee,
      status: record?.status === "paid" ? ("paid" as const) : ("unpaid" as const),
      paidDate: record?.paidDate ? new Date(record.paidDate).toLocaleDateString() : "",
    };
  });
  const paidMonths = feeRows.filter((row) => row.status === "paid").length;

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between"><Link href="/dashboard/students" className="text-sm font-medium text-blue-600">← Students</Link><Link href={`/dashboard/students/${String(student._id)}/edit`} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Edit profile</Link></div>
        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="bg-blue-700 p-8 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">Student profile</p>
            <div className="mt-5 flex items-center gap-5">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl bg-white/15 text-2xl sm:text-3xl font-bold">
                {student.profilePhotoUrl ? <img src={`/api/students/${String(student._id)}/photo`} alt="Student profile" className="h-full w-full object-cover" /> : student.fullName.charAt(0)}
              </div>
              <div><h1 className="text-2xl sm:text-3xl font-bold">{student.fullName}</h1><p className="mt-2 text-blue-100">{student.studentId} · Class {student.class}-{student.section} · Roll {student.rollNumber}</p></div>
            </div>
          </div>
          <div className="grid gap-8 p-8 sm:grid-cols-2">
            <div><h2 className="font-semibold">Student information</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">CNIC</dt><dd>{student.cnic}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Gender</dt><dd className="capitalize">{student.gender ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="capitalize">{student.accountStatus}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Admission</dt><dd>{new Date(student.admissionDate).toLocaleDateString()}</dd></div></dl></div>
            <div><h2 className="font-semibold">Parent information</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Father</dt><dd>{student.fatherName ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Phone</dt><dd>{student.fatherPhone ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Address</dt><dd className="text-right">{student.homeAddress ?? "-"}</dd></div></dl></div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-8 py-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold">Monthly fees (last 12 months)</h2>
              <p className="mt-1 text-sm text-slate-500">Mark any month paid or unpaid. The student sees this immediately in the student portal.</p>
            </div>
            <p className="text-sm font-semibold text-emerald-700">
              {paidMonths} of {feeRows.length} months paid
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-8 py-4">Month</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Amount</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th>
                  <th className="px-8 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feeRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-8 py-4 font-medium">
                      {row.month} {row.year}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">{row.amount}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <span
                        className={
                          row.status === "paid"
                            ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                            : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                        }
                      >
                        {row.status === "paid" ? "Paid" : "Unpaid"}
                      </span>
                      {row.paidDate ? <p className="mt-1 text-xs text-slate-400">Paid on {row.paidDate}</p> : null}
                    </td>
                    <td className="px-8 py-4">
                      <FeeActions studentId={studentId} month={row.month} year={row.year} status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <details className="group mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <summary className="cursor-pointer list-none px-8 py-5 font-semibold">Attendance history <span className="float-right text-sm font-normal text-slate-400 group-open:hidden">View details +</span><span className="float-right hidden text-sm font-normal text-slate-400 group-open:inline">Hide details -</span></summary>
          <div className="overflow-x-auto border-t border-slate-100 px-8 py-4"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3">Date</th><th className="py-3">Class</th><th className="py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{attendance.map((record) => <tr key={String(record._id)}><td className="py-3">{new Date(record.date).toLocaleDateString()}</td><td className="py-3">{record.classSection}</td><td className="py-3 capitalize">{record.status}</td></tr>)}</tbody></table>{attendance.length === 0 && <p className="py-6 text-sm text-slate-400">No attendance records available.</p>}</div>
        </details>
      </div>
    </main>
  );
}
