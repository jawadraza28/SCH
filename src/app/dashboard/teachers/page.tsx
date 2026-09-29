import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const params = await searchParams;
  const limit = DEFAULT_PAGE_SIZE;
  const total = await Teacher.countDocuments();
  const pages = countPages(total, limit);
  const page = clampPage(parsePageNumber(params.page), pages);
  const teachers = await Teacher.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();

  function teachersHref(target: number) {
    return target > 1 ? `/dashboard/teachers?page=${target}` : "/dashboard/teachers";
  }
  return <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10"><div className="mx-auto max-w-7xl"><Link href="/dashboard" className="text-sm font-medium text-blue-600">← Back to dashboard</Link><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">People</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Teachers</h1><p className="mt-2 text-slate-500">Manage teaching accounts, profile details, and class assignments.</p></div><Link href="/dashboard/teachers/new" className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-500">Add teacher</Link></div><div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{teachers.length === 0 ? <div className="px-6 py-20 text-center"><p className="font-semibold text-slate-700">No teachers yet</p><p className="mt-1 text-sm text-slate-400">Add your first teaching account to begin assigning classes.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-4">Teacher</th><th className="px-6 py-4">CNIC</th><th className="px-6 py-4">Subject</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{teachers.map((teacher) => <tr key={String(teacher._id)}><td className="px-6 py-4 font-semibold">{teacher.name}</td><td className="px-6 py-4 text-slate-600">{teacher.cnic}</td><td className="px-6 py-4 text-slate-600">{teacher.subject || "-"}</td><td className="px-6 py-4"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-700">{teacher.accountStatus}</span></td><td className="px-6 py-4"><Link href={`/dashboard/teachers/${String(teacher._id)}/edit`} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Edit</Link></td></tr>)}</tbody></table></div>}<div className="border-t border-slate-100 px-6 py-4">{teachers.length > 0 && <Pagination page={page} pages={pages} hrefFor={teachersHref} />}</div></div></div></main>;
}
