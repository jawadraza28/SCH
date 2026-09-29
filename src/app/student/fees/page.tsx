import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Fee, Student } from "@/Models";
import { lastTwelveMonthsNewestFirst } from "@/lib/fees";

export const dynamic = "force-dynamic";

export default async function StudentFeesPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  if (!student) {
    return (
      <main className="min-h-screen bg-slate-100 p-8 text-center text-slate-500">
        Student profile not found. Please contact the school office.
      </main>
    );
  }

  const fees = await Fee.find({ student: student._id }).lean();
  const feeByMonth = new Map(fees.map((fee) => [`${fee.month}-${fee.year}`, fee]));
  // The student always sees the whole one year window, most recent month first.
  const feeRows = lastTwelveMonthsNewestFirst().map((entry) => {
    const record = feeByMonth.get(entry.key);
    return {
      ...entry,
      amount: Number(record?.amount ?? 0),
      status: record?.status === "paid" ? ("paid" as const) : ("unpaid" as const),
      paidDate: record?.paidDate ? new Date(record.paidDate).toLocaleDateString() : "",
    };
  });
  const paid = feeRows.filter((row) => row.status === "paid").length;
  const unpaid = feeRows.length - paid;
  const totalPaid = feeRows.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amount, 0);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <a href="/student" className="text-sm font-medium text-blue-600">
          ← Student portal
        </a>
        <h1 className="mt-6 text-3xl font-bold">Fees</h1>
        <p className="mt-2 text-slate-500">
          Your monthly fee status for the last twelve months, including previous paid and unpaid months.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Months paid</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{paid}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Months unpaid</p>
            <p className="mt-2 text-3xl font-bold text-red-600">{unpaid}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total paid</p>
            <p className="mt-2 text-3xl font-bold">{totalPaid}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Months shown</p>
            <p className="mt-2 text-3xl font-bold">{feeRows.length}</p>
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold">Monthly fee records</h2>
            <p className="mt-1 text-sm text-slate-500">
              A month is shown as unpaid until the school office marks it paid.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4">Month</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Paid date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feeRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-6 py-4 font-medium">
                      {row.month} {row.year}
                    </td>
                    <td className="px-6 py-4">{row.amount}</td>
                    <td className="px-6 py-4">
                      <span
                        className={
                          row.status === "paid"
                            ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                            : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                        }
                      >
                        {row.status === "paid" ? "Paid" : "Unpaid"}
                      </span>
                    </td>
                    <td className="px-6 py-4">{row.paidDate || "-"}</td>
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
