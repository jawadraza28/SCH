import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Homework, Student } from "@/Models";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function StudentHomeworkPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findOne({ cnic: session.user.cnic }).lean();
  const query = student ? { assignedToClass: student.class, assignedToSection: student.section, isActive: true } : null;
  const limit = DEFAULT_PAGE_SIZE;
  const total = query ? await Homework.countDocuments(query) : 0;
  const pages = countPages(total, limit);
  const page = clampPage(parsePageNumber((await searchParams).page), pages);
  const homework = query ? await Homework.find(query).sort({ dueDate: 1 }).skip((page - 1) * limit).limit(limit).lean() : [];

  function studentHomeworkHref(target: number) {
    return target > 1 ? `/student/homework?page=${target}` : "/student/homework";
  }
  return <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10"><div className="mx-auto max-w-4xl"><a href="/student" className="text-sm font-medium text-blue-600">← Student portal</a><h1 className="mt-6 text-3xl font-bold">Homework</h1><p className="mt-2 text-slate-500">Assignments for your current class and section.</p><section className="mt-8 space-y-4">{homework.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center text-sm text-slate-400">No homework assigned yet.</div> : homework.map((item) => <article key={String(item._id)} className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{item.subject}</span><h2 className="mt-3 text-xl font-semibold">{item.title}</h2></div><p className="text-sm text-slate-500">Due {new Date(item.dueDate).toLocaleDateString()}</p></div><p className="mt-4 whitespace-pre-wrap leading-7 text-slate-600">{item.description}</p><p className="mt-4 text-xs text-slate-400">Class {item.assignedToClass}-{item.assignedToSection}</p></article>)}<div className="border-t border-slate-100 px-6 py-4">{homework.length > 0 && <Pagination page={page} pages={pages} hrefFor={studentHomeworkHref} />}</div></section></div></main>;
}
