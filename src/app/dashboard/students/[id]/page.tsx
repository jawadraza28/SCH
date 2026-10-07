import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, ClassSection, Fee, SchoolConfiguration, Student } from "@/Models";
import { feePaidAmount, feeRemaining, feeStatusOf, lastTwelveMonthsNewestFirst } from "@/lib/fees";
import FeeActions from "@/components/FeeActions";
import { formatMoney } from "@/components/charts/palette";
import { voucherRecipient } from "@/lib/voucher";
import AttendanceHistory from "@/components/AttendanceHistory";
import { buildAttendanceDateFilter } from "@/lib/attendance";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";
import AdminPasswordResetButton from "@/components/AdminPasswordResetButton";
import SiblingsPanel from "@/components/SiblingsPanel";

export const dynamic = "force-dynamic";

export default async function AdminStudentProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string; from?: string; to?: string; page?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findById((await params).id).lean();
  if (!student) notFound();

  const studentId = String(student._id);
  const queryParams = await searchParams;
  const filters = buildAttendanceDateFilter(queryParams);
  const attendanceQuery = { student: student._id, ...(filters.date ? { date: filters.date } : {}) };
  const [fees, attendanceTotal, attendanceStats] = await Promise.all([
    Fee.find({ student: student._id }).lean(),
    Attendance.countDocuments(attendanceQuery),
    Attendance.aggregate([{ $match: attendanceQuery }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const pages = countPages(attendanceTotal, DEFAULT_PAGE_SIZE);
  const page = clampPage(parsePageNumber(queryParams.page), pages);
  const attendance = await Attendance.find(attendanceQuery).sort({ date: -1 }).skip((page - 1) * DEFAULT_PAGE_SIZE).limit(DEFAULT_PAGE_SIZE).lean();
  const countOf = (status: string) => Number(attendanceStats.find((item) => item._id === status)?.count ?? 0);
  const attendanceHref = (target: number) => {
    const query = new URLSearchParams();
    if (filters.month) query.set("month", filters.month);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (target > 1) query.set("page", String(target));
    const suffix = query.toString();
    return suffix ? `?${suffix}` : ".";
  };
  const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).lean() : null;
  const monthlyFee = Number(school?.monthlyFee ?? 0);
  // Priced exactly like the fees screen: the class's own fee when it has one,
  // school-wide fee otherwise — so the same student never shows two amounts.
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classSection = await ClassSection.findOne({
    className: { $regex: `^${escapeRegex(String(student.class))}$`, $options: "i" },
    sectionName: { $regex: `^${escapeRegex(String(student.section))}$`, $options: "i" },
  }).select("fee").lean();
  const classFee = Number(classSection?.fee ?? 0);
  const pricedFee = classFee > 0 ? classFee : monthlyFee;
  const feeByMonth = new Map(fees.map((fee) => [`${fee.month}-${fee.year}`, fee]));
  // Every student always shows the full one year window, most recent month first,
  // priced with what has been received and what still remains on each month.
  const feeRows = lastTwelveMonthsNewestFirst().map((entry) => {
    const record = feeByMonth.get(entry.key);
    // A stored amount of 0 predates the fee being configured — fall back to the
    // live price instead of showing Rs 0 next to a paid-out history.
    const stored = Number(record?.amount ?? 0);
    const amount = stored > 0 ? stored : pricedFee;
    const paidAmount = record ? feePaidAmount(record) : 0;
    return {
      ...entry,
      amount,
      paidAmount,
      remaining: feeRemaining(amount, paidAmount),
      status: record ? feeStatusOf(amount, paidAmount) : ("unpaid" as const),
      paidDate: record?.paidDate ? new Date(record.paidDate).toLocaleDateString() : "",
    };
  });
  const paidMonths = feeRows.filter((row) => row.status === "paid").length;
  const balanceDue = feeRows.reduce((sum, row) => sum + row.remaining, 0);
  // The receipt the WhatsApp button words and addresses after each payment.
  const receipt = {
    schoolName: school?.schoolName ?? "",
    studentName: String(student.fullName),
    className: String(student.class),
    section: String(student.section),
    rollNumber: student.rollNumber ? String(student.rollNumber) : "",
    phone: voucherRecipient(student),
    voucherNo: student.voucherNo ? String(student.voucherNo) : "",
  };

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between"><Link href="/dashboard/students" className="text-sm font-medium text-blue-600">← Students</Link><Link href={`/dashboard/students/${String(student._id)}/edit`} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Edit profile</Link></div>
        <SiblingsPanel studentId={studentId} basePath="/dashboard/students" />
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
            <div><h2 className="font-semibold">Student information</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">CNIC</dt><dd>{student.cnic}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Gender</dt><dd className="capitalize">{student.gender ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="capitalize">{student.accountStatus}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Admission</dt><dd>{new Date(student.admissionDate).toLocaleDateString()}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Date of birth</dt><dd>{student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : '—'}</dd></div></dl></div>
            <div><h2 className="font-semibold">Parent information</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Father</dt><dd>{student.fatherName ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Father CNIC</dt><dd>{student.fatherCNIC ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Occupation</dt><dd>{student.fatherOccupation ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Phone</dt><dd>{student.fatherPhone ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Mother</dt><dd>{student.motherName ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Emergency</dt><dd>{student.emergencyContact ?? "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Address</dt><dd className="text-right">{student.homeAddress ?? "-"}</dd></div></dl></div>
          </div>
          <div className="px-8 pb-8"><AdminPasswordResetButton id={studentId} role="student" /></div>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:px-8 sm:py-5">
            <div>
              <h2 className="font-semibold">Monthly fees (last 12 months)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Mark a month paid, record a part payment, or reverse it. The student sees this in the portal at once.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-sm font-semibold text-emerald-700">
                {paidMonths} of {feeRows.length} months paid
              </p>
              <p className={`text-sm font-semibold ${balanceDue > 0 ? "text-rose-600" : "text-slate-500"}`}>
                {balanceDue > 0 ? `${formatMoney(balanceDue)} due` : "Nothing due"}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="stack-table w-full text-left text-sm md:min-w-[680px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Month</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Fee · paid · balance</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {feeRows.map((row) => (
                  <tr key={row.key}>
                    <td data-full className="px-4 py-3 sm:px-6 sm:py-4 font-medium">
                      {row.month} {row.year}
                      {row.paidDate ? <p className="mt-1 text-xs text-slate-400">Paid on {row.paidDate}</p> : null}
                    </td>
                    <td data-label="Fee" className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">
                      <p className="tabular-nums">{formatMoney(row.amount)}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-emerald-600">Paid {formatMoney(row.paidAmount)}</p>
                      {row.remaining > 0 ? (
                        <p className="text-xs tabular-nums text-rose-600">Balance {formatMoney(row.remaining)}</p>
                      ) : null}
                    </td>
                    <td data-label="Status" className="px-4 py-3 sm:px-6 sm:py-4">
                      <span
                        className={
                          row.amount <= 0
                            ? "whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"
                            : row.status === "paid"
                              ? "whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                              : row.status === "partial"
                                ? "whitespace-nowrap rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                                : "whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                        }
                      >
                        {row.amount <= 0 ? "No fee" : row.status === "paid" ? "Paid" : row.status === "partial" ? "Partly paid" : "Unpaid"}
                      </span>
                    </td>
                    <td data-label="Action" data-full className="px-4 py-3 sm:px-6 sm:py-4">
                      <div className="flex flex-col items-end gap-2">
                        <FeeActions
                          studentId={studentId}
                          month={row.month}
                          year={row.year}
                          status={row.status}
                          amount={row.amount}
                          paidAmount={row.paidAmount}
                          receipt={receipt}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <AttendanceHistory records={attendance} page={page} pages={pages} month={filters.month} from={filters.from} to={filters.to} present={countOf("present")} late={countOf("late")} absent={countOf("absent")} leave={countOf("leave")} holidays={countOf("holiday")} hrefFor={attendanceHref} />
      </div>
    </main>
  );
}
