import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";
import Pagination from "@/components/Pagination";
import DeleteButton from "@/components/DeleteButton";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";
import FilterChips from "@/components/FilterChips";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ page?: string; search?: string; gender?: string; status?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const gender = ["male", "female", "other"].includes(params.gender ?? "") ? params.gender : "";
  const status = ["active", "inactive", "pending"].includes(params.status ?? "") ? params.status : "";
  const filters: Record<string, unknown>[] = [];
  if (search) filters.push({ $or: [{ name: { $regex: search, $options: "i" } }, { cnic: { $regex: search, $options: "i" } }, { subject: { $regex: search, $options: "i" } }, { phone: { $regex: search, $options: "i" } }] });
  if (gender) filters.push({ gender });
  if (status) filters.push({ accountStatus: status });
  const query = filters.length ? { $and: filters } : {};
  const limit = DEFAULT_PAGE_SIZE;
  const total = await Teacher.countDocuments(query);
  const pages = countPages(total, limit);
  const page = clampPage(parsePageNumber(params.page), pages);
  const teachers = await Teacher.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  function teachersHref(target: number) {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (gender) next.set("gender", gender);
    if (status) next.set("status", status);
    if (target > 1) next.set("page", String(target));
    return next.toString() ? `/dashboard/teachers?${next}` : "/dashboard/teachers";
  }
  const activeFilterItems = [search ? { label: "Search", value: search } : null, gender ? { label: "Gender", value: gender } : null, status ? { label: "Status", value: status } : null].filter((item): item is { label: string; value: string } => Boolean(item));
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-7xl"><BackLink /><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">People</p><h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">Teachers</h1><p className="mt-2 text-slate-500">Manage teaching accounts, profiles, attendance, and class assignments.</p></div><Link href="/dashboard/teachers/new" className="w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-500 sm:w-auto">Add teacher</Link></div><div className="mt-5 flex flex-wrap gap-2"><Link href="/dashboard/teacher-attendance" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700">Mark attendance</Link><Link href="/dashboard/finance?tab=salaries" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700">Salaries · paid / unpaid</Link><Link href="/dashboard/teachers/assign" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700">Assign classes</Link></div><form method="get" className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_1fr_auto]"><label className="text-sm font-medium">Search<input name="search" defaultValue={search} placeholder="Name, CNIC, subject, or phone" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Gender<select name="gender" defaultValue={gender} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">All genders</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label><label className="text-sm font-medium">Status<select name="status" defaultValue={status} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending">Pending</option></select></label><div className="flex flex-wrap items-end gap-2"><button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Apply</button><Link href="/dashboard/teachers" className="whitespace-nowrap rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600">Reset</Link></div></form><FilterChips items={activeFilterItems} clearHref="/dashboard/teachers" /><div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{teachers.length === 0 ? <div className="px-4 py-16 text-center"><p className="font-semibold text-slate-700">No teachers found</p></div> : <div className="overflow-x-auto"><table className="stack-table w-full text-left text-sm md:min-w-[900px]"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 sm:px-6 sm:py-4">Teacher</th><th className="px-4 py-3 sm:px-6 sm:py-4">CNIC</th><th className="px-4 py-3 sm:px-6 sm:py-4">Subject</th><th className="px-4 py-3 sm:px-6 sm:py-4">Gender</th><th className="px-4 py-3 sm:px-6 sm:py-4">Status</th><th className="px-4 py-3 sm:px-6 sm:py-4">Action</th></tr></thead><tbody>{teachers.map((teacher) => <tr key={String(teacher._id)}><td data-full className="px-4 py-3 sm:px-6 sm:py-4 font-semibold"><Link href={`/dashboard/teachers/${String(teacher._id)}`} className="text-blue-700 hover:underline">{teacher.name}</Link></td><td data-label="CNIC" className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">{teacher.cnic}</td><td data-label="Subject" className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">{teacher.subject || "-"}</td><td data-label="Gender" className="px-4 py-3 sm:px-6 sm:py-4 capitalize">{teacher.gender || "-"}</td><td data-label="Status" className="px-4 py-3 sm:px-6 sm:py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${teacher.accountStatus === "active" ? "bg-emerald-50 text-emerald-700" : teacher.accountStatus === "inactive" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>{teacher.accountStatus}</span></td><td data-label="Action" data-full className="px-4 py-3 sm:px-6 sm:py-4"><Link href={`/dashboard/teachers/${String(teacher._id)}/edit`} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Edit</Link>{" "}<DeleteButton endpoint={`/api/teachers/${String(teacher._id)}`} /></td></tr>)}</tbody></table></div>}<div className="border-t border-slate-100 px-6 py-4">{teachers.length > 0 && <Pagination page={page} pages={pages} hrefFor={teachersHref} />}</div></div></div></main>;
}
