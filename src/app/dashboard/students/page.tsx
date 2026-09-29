import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student } from "@/Models";
import PhotoUpload from "./PhotoUpload";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const query = search ? { accountStatus: "active", $or: [{ fullName: { $regex: search, $options: "i" } }, { studentId: { $regex: search, $options: "i" } }, { cnic: { $regex: search, $options: "i" } }] } : { accountStatus: "active" };
  const limit = DEFAULT_PAGE_SIZE;
  const total = await Student.countDocuments(query);
  const pages = countPages(total, limit);
  const page = clampPage(parsePageNumber(params.page), pages);
  const students = await Student.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();

  // Keeps the active search while moving between pages.
  function studentsHref(target: number) {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (target > 1) next.set("page", String(target));
    const queryString = next.toString();
    return queryString ? `/dashboard/students?${queryString}` : "/dashboard/students";
  }

  return <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10"><div className="mx-auto max-w-7xl"><Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to dashboard</Link><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">People</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Students</h1><p className="mt-2 text-slate-500">Approved students in your school. New students appear here after administrator approval.</p></div><Link href="/dashboard/students/requests" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700 hover:bg-blue-100">Review requests</Link></div><form className="mt-8 flex gap-3" method="get"><input name="search" defaultValue={search} placeholder="Search name, student ID, or CNIC" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500" /><button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Search</button></form><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-4"><p className="text-sm text-slate-500">{total ? `Showing page ${page} of ${pages} · ${total} approved student${total === 1 ? "" : "s"}` : "0 approved students"}</p></div>{students.length === 0 ? <div className="px-6 py-20 text-center"><p className="font-semibold text-slate-700">No approved students found</p><p className="mt-1 text-sm text-slate-400">Pending teacher requests appear in Review requests.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-4">Student</th><th className="px-6 py-4">Student ID</th><th className="px-6 py-4">Class</th><th className="px-6 py-4">Roll number</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Photo</th></tr></thead><tbody className="divide-y divide-slate-100">{students.map((student) => <tr key={String(student._id)} className="hover:bg-slate-50"><td className="px-6 py-4"><Link href={`/dashboard/students/${String(student._id)}`} className="font-semibold text-blue-700 hover:underline">{student.fullName}</Link><p className="mt-1 text-xs text-slate-400">{student.cnic}</p></td><td className="px-6 py-4 text-slate-600">{student.studentId}</td><td className="px-6 py-4 text-slate-600">{student.class}-{student.section}</td><td className="px-6 py-4 text-slate-600">{student.rollNumber}</td><td className="px-6 py-4"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-700">{student.accountStatus}</span></td><td className="px-6 py-4"><PhotoUpload studentId={String(student._id)} /></td></tr>)}</tbody></table></div>}<div className="border-t border-slate-100 px-6 py-4">{students.length > 0 && <Pagination page={page} pages={pages} hrefFor={studentsHref} />}</div></div></div></main>;
}
