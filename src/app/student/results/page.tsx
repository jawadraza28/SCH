import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Result, Student } from "@/Models";

export const dynamic = "force-dynamic";

export default async function StudentResultsPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  const results = student ? await Result.find({ student: student._id }).populate("examTerm", "title").sort({ createdAt: -1 }).lean() : [];
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><a href="/student" className="text-sm font-medium text-blue-600">← Student portal</a><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Results</h1><p className="mt-2 text-slate-500">Your academic results and marks.</p><section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">{results.length === 0 ? <div className="px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">No results available yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 sm:px-6 sm:py-4">Exam / term</th><th className="px-4 py-3 sm:px-6 sm:py-4">Subject</th><th className="px-4 py-3 sm:px-6 sm:py-4">Marks</th><th className="px-4 py-3 sm:px-6 sm:py-4">Percentage</th><th className="px-4 py-3 sm:px-6 sm:py-4">Result</th></tr></thead><tbody className="divide-y divide-slate-100">{results.map((result) => <tr key={String(result._id)}><td className="px-4 py-3 sm:px-6 sm:py-4 font-medium">{typeof result.examTerm === "object" && result.examTerm ? (result.examTerm as { title?: string }).title : "-"}</td><td className="px-4 py-3 sm:px-6 sm:py-4">{result.subject}</td><td className="px-4 py-3 sm:px-6 sm:py-4">{result.obtainedMarks}/{result.totalMarks}</td><td className="px-4 py-3 sm:px-6 sm:py-4">{result.percentage}%</td><td className="px-4 py-3 sm:px-6 sm:py-4"><span className={result.result === "pass" ? "text-emerald-600" : "text-red-600"}>{result.result}</span></td></tr>)}</tbody></table></div>}</section></div></main>;
}
