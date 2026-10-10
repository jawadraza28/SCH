import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Fee, Student } from "@/Models";
import { feePaidAmount, feeRemaining, feeStatusOf } from "@/lib/fees";
import { monthNames } from "@/lib/retention";
import { formatMoney } from "@/components/charts/palette";

export const dynamic = "force-dynamic";

/** The pill naming a month's state — paid, partly paid, or unpaid. */
function PortalStatus({ status }: { status: "paid" | "partial" | "unpaid" }) {
  const look =
    status === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : status === "partial"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-700";
  const label = status === "paid" ? "Paid" : status === "partial" ? "Partly paid" : "Unpaid";
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${look}`}>{label}</span>;
}

export default async function StudentFeesPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  if (!student) {
    return (
      <main className="app-page bg-slate-100 p-5 text-center sm:p-8 text-slate-500">
        Student profile not found. Please contact the school office.
      </main>
    );
  }

  const section = await ClassSection.findOne({ className: student.class, sectionName: student.section }).select("academicYear startDate endDate").lean();
  const fees = await Fee.find({ student: student._id, academicYear: student.academicYear || section?.academicYear || "" }).lean();
  const feeByMonth = new Map(fees.map((fee) => [`${fee.month}-${fee.year}`, fee]));
  const start = section?.startDate ? new Date(`${section.startDate}T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const end = section?.endDate ? new Date(`${section.endDate}T23:59:59`) : new Date();
  const through = new Date(Math.min(Date.now(), end.getTime()));
  const sessionMonths = [];
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= through; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    sessionMonths.push({ month: monthNames[cursor.getMonth()], year: cursor.getFullYear(), key: `${monthNames[cursor.getMonth()]}-${cursor.getFullYear()}` });
  }
  const feeRows = sessionMonths.reverse().map((entry) => {
    const record = feeByMonth.get(entry.key);
    const amount = Number(record?.amount ?? 0);
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
  const paid = feeRows.filter((row) => row.status === "paid").length;
  const partial = feeRows.filter((row) => row.status === "partial").length;
  const unpaid = feeRows.length - paid - partial;
  const totalPaid = feeRows.reduce((sum, row) => sum + row.paidAmount, 0);
  const balanceDue = feeRows.reduce((sum, row) => sum + row.remaining, 0);

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-4xl">
        <a href="/student" className="text-sm font-medium text-blue-600">
          ← Student portal
        </a>
        <h1 className="mt-6 text-2xl sm:text-3xl font-bold">Fees</h1>
        <p className="mt-2 text-slate-500">
          Your monthly fee status for the last twelve months, including what has been paid and what still remains.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Months paid</p>
            <p className="mt-2 text-2xl sm:text-3xl font-bold text-emerald-600">{paid}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Partly paid</p>
            <p className="mt-2 text-2xl sm:text-3xl font-bold text-blue-600">{partial}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Unpaid months</p>
            <p className="mt-2 text-2xl sm:text-3xl font-bold text-amber-600">{unpaid}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total paid</p>
            <p className="mt-2 text-2xl sm:text-3xl font-bold text-emerald-600">{formatMoney(totalPaid)}</p>
          </div>
        </div>

        {/* Outstanding balance — the one number the parent came here for. */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Balance still due</p>
          <p className={`mt-2 text-2xl sm:text-3xl font-bold ${balanceDue > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {formatMoney(balanceDue)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {balanceDue > 0
              ? "Please clear this at the school office."
              : "Nothing outstanding across the last twelve months."}
          </p>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
            <h2 className="font-semibold">Monthly fee records</h2>
            <p className="mt-1 text-sm text-slate-500">
              A month shows as unpaid until the school office records a payment against it. Part payments show what has
              been received and what remains.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="stack-table w-full text-left text-sm md:min-w-[640px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Month</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Fee</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Paid</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Balance</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Paid date</th>
                </tr>
              </thead>
              <tbody>
                {feeRows.map((row) => (
                  <tr key={row.key}>
                    <td data-full className="px-4 py-3 sm:px-6 sm:py-4 font-medium">
                      {row.month} {row.year}
                    </td>
                    <td data-label="Fee" className="px-4 py-3 sm:px-6 sm:py-4">{formatMoney(row.amount)}</td>
                    <td data-label="Paid" className="px-4 py-3 sm:px-6 sm:py-4 text-emerald-600">
                      {formatMoney(row.paidAmount)}
                    </td>
                    <td
                      data-label="Balance"
                      className={`px-4 py-3 sm:px-6 sm:py-4 ${row.remaining > 0 ? "text-rose-600" : "text-slate-400"}`}
                    >
                      {row.remaining > 0 ? formatMoney(row.remaining) : "—"}
                    </td>
                    <td data-label="Status" className="px-4 py-3 sm:px-6 sm:py-4">
                      <PortalStatus status={row.status} />
                    </td>
                    <td data-label="Paid date" className="px-4 py-3 sm:px-6 sm:py-4 text-slate-500">
                      {row.paidDate || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
