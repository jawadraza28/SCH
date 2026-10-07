import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Result, Student } from "@/Models";

export const dynamic = "force-dynamic";

type ResultRow = {
  _id: unknown;
  subject: string;
  totalMarks: number;
  passingMarks: number;
  obtainedMarks: number;
  percentage: number;
  result: "pass" | "fail";
  createdAt: Date | string;
  examTerm?: { _id?: unknown; title?: string } | unknown;
};

export default async function StudentResultsPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  const results = student ? await Result.find({ student: student._id }).populate("examTerm", "title").sort({ createdAt: -1 }).lean() as unknown as ResultRow[] : [];
  const groups = new Map<string, { title: string; rows: ResultRow[] }>();
  results.forEach((row) => {
    const term = typeof row.examTerm === "object" && row.examTerm ? row.examTerm as { _id?: unknown; title?: string } : {};
    const key = String(term._id ?? term.title ?? "unknown");
    const group = groups.get(key) ?? { title: term.title ?? "Exam term", rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  });

  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><Link href="/student" className="text-sm font-medium text-blue-600">← Student portal</Link><h1 className="mt-6 text-2xl font-bold sm:text-3xl">Results</h1><p className="mt-2 text-slate-500">Your term results, marks and subject details.</p><div className="mt-8 space-y-4">{groups.size === 0 ? <div className="rounded-2xl bg-white px-4 py-16 text-center text-sm text-slate-400">No results available yet.</div> : [...groups.values()].map((group) => {
    const total = group.rows.reduce((sum, row) => sum + Number(row.totalMarks), 0);
    const obtained = group.rows.reduce((sum, row) => sum + Number(row.obtainedMarks), 0);
    const percentage = total ? Math.round((obtained / total) * 100) : 0;
    const passed = group.rows.every((row) => row.result === "pass");
    const uploaded = group.rows.reduce((latest, row) => new Date(row.createdAt) > new Date(latest) ? row.createdAt : latest, group.rows[0].createdAt);
    return <details key={group.title} className="group overflow-hidden rounded-2xl bg-white shadow-sm"><summary className="cursor-pointer list-none p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Term result</p><h2 className="mt-1 text-lg font-bold">{group.title}</h2><p className="mt-1 text-sm text-slate-500">Uploaded {new Date(uploaded).toLocaleDateString()}</p></div><div className="flex items-center gap-5"><div><p className="text-xs text-slate-500">Overall</p><p className="text-2xl font-bold text-blue-700">{percentage}%</p></div><div><p className="text-xs text-slate-500">Status</p><p className={`font-bold capitalize ${passed ? "text-emerald-600" : "text-red-600"}`}>{passed ? "Pass" : "Fail"}</p></div><span className="text-slate-400 group-open:rotate-180">⌄</span></div></div></summary><div className="border-t border-slate-100 px-5 py-4 sm:px-6"><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Total marks</p><p className="mt-1 font-bold">{total}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Total obtained</p><p className="mt-1 font-bold">{obtained}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Papers</p><p className="mt-1 font-bold">{group.rows.length}</p></div></div><div className="overflow-x-auto"><table className="stack-table w-full text-left text-sm md:min-w-[640px]"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3">Percentage</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{group.rows.map((row) => <tr key={String(row._id)}><td data-label="Subject" className="px-4 py-3 font-medium">{row.subject}</td><td data-label="Marks" className="px-4 py-3">{row.obtainedMarks}/{row.totalMarks} <span className="text-xs text-slate-400">(pass {row.passingMarks})</span></td><td data-label="Percentage" className="px-4 py-3">{row.percentage}%</td><td data-label="Status" className={`px-4 py-3 font-semibold capitalize ${row.result === "pass" ? "text-emerald-600" : "text-red-600"}`}>{row.result}</td></tr>)}</tbody></table></div></div></details>;
  })}</div></div></main>;
}
