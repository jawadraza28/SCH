import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Fee, Student } from "@/Models";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";
import DeleteButton from "@/components/DeleteButton";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ search?: string; page?: string; className?: string; section?: string; gender?: string; status?: string; from?: string; to?: string; sort?: string; presentOn?: string; attendanceStatus?: string; feeStatus?: string; feeMonth?: string; feeYear?: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const className = params.className?.trim() ?? "";
  const section = params.section?.trim() ?? "";
  const rawGender = params.gender ?? "";
  const gender = ["male", "female", "other"].includes(rawGender) ? rawGender : "";
  const rawStatus = params.status ?? "";
  const statusFilter = ["active", "suspended", "rejected"].includes(rawStatus) ? rawStatus : "active";
  // Deep link from the dashboard "Present today" card: restrict the list to the
  // students who were marked present on one specific day. Everything else
  // (advanced search, dropdown filters, sorting, pagination) keeps working on
  // top of this restriction because it is just another $and condition.
  const presentOn = /^\d{4}-\d{2}-\d{2}$/.test(params.presentOn ?? "") ? (params.presentOn as string) : "";
  const attendanceStatus = ["present", "absent", "late", "leave", "holiday"].includes(params.attendanceStatus ?? "") ? params.attendanceStatus ?? "present" : "present";
  const feeStatus = ["paid", "unpaid"].includes(params.feeStatus ?? "") ? params.feeStatus ?? "" : "";
  const feeMonth = params.feeMonth ?? "";
  const feeYear = /^\d{4}$/.test(params.feeYear ?? "") ? params.feeYear ?? "" : "";
  const presentOnLabel = presentOn ? new Date(`${presentOn}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
  let from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? (params.from as string) : "";
  let to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? (params.to as string) : "";
  if (from && to && from > to) { const swap = from; from = to; to = swap; }
  const sortKey = params.sort ?? "";
  const hasFilters = Boolean(search || className || section || gender || statusFilter !== "active" || from || to || presentOn || feeStatus || feeMonth || feeYear);

  // Advanced search: every whitespace-separated word must match at least one
  // searchable field. Tokens are regex-escaped so characters like "(" or "+"
  // can never produce an invalid query.
  const conditions: Record<string, unknown>[] = [{ accountStatus: statusFilter }];
  const tokens = search.split(/\s+/).map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  if (tokens.length) {
    conditions.push({ $and: tokens.map((token) => ({ $or: [
      { fullName: { $regex: token, $options: "i" } },
      { studentId: { $regex: token, $options: "i" } },
      { cnic: { $regex: token, $options: "i" } },
      { rollNumber: { $regex: token, $options: "i" } },
      { fatherName: { $regex: token, $options: "i" } },
      { fatherPhone: { $regex: token, $options: "i" } },
    ] })) });
  }
  if (className) conditions.push({ class: className });
  if (section) conditions.push({ section });
  if (gender) conditions.push({ gender });
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999Z`);
    conditions.push({ admissionDate: range });
  }
  if (presentOn) {
    // Attendance.date is stored as a local calendar day, so compare within the
    // same day boundaries the teacher-facing attendance screen writes.
    const dayStart = new Date(`${presentOn}T00:00:00.000`);
    const dayEnd = new Date(`${presentOn}T23:59:59.999`);
    const marks = await Attendance.find({ date: { $gte: dayStart, $lte: dayEnd }, status: attendanceStatus }).select("student").lean();
    conditions.push({ _id: { $in: marks.map((mark) => mark.student).filter(Boolean) } });
  }
  if (feeStatus || feeMonth || feeYear) {
    const feeQuery: Record<string, unknown> = {};
    if (feeStatus) feeQuery.status = feeStatus;
    if (feeMonth) feeQuery.month = feeMonth;
    if (feeYear) feeQuery.year = Number(feeYear);
    const feeStudentIds = await Fee.find(feeQuery).distinct("student");
    conditions.push({ _id: { $in: feeStudentIds } });
  }
  const query = { $and: conditions };
  const sort: Record<string, 1 | -1> = sortKey === "oldest" ? { createdAt: 1, _id: 1 }
    : sortKey === "name" ? { fullName: 1, _id: 1 }
    : sortKey === "class" ? { class: 1, section: 1, rollNumber: 1 }
    : { createdAt: -1, _id: -1 };

  // Dropdown options come from the students currently in scope so every
  // option is guaranteed to return results.
  const [classOptions, sectionOptions] = await Promise.all([
    Student.distinct("class", { accountStatus: statusFilter }) as Promise<string[]>,
    Student.distinct("section", className ? { accountStatus: statusFilter, class: className } : { accountStatus: statusFilter }) as Promise<string[]>,
  ]);
  classOptions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  sectionOptions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const limit = DEFAULT_PAGE_SIZE;
  const total = await Student.countDocuments(query);
  const pages = countPages(total, limit);
  const page = clampPage(parsePageNumber(params.page), pages);
  const students = await Student.find(query).sort(sort).skip((page - 1) * limit).limit(limit).lean();

  // Keeps the active filters while moving between pages.
  function studentsHref(target: number) {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (className) next.set("className", className);
    if (section) next.set("section", section);
    if (gender) next.set("gender", gender);
    if (statusFilter !== "active") next.set("status", statusFilter);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (presentOn) next.set("presentOn", presentOn);
    if (presentOn && attendanceStatus !== "present") next.set("attendanceStatus", attendanceStatus);
    if (feeStatus) next.set("feeStatus", feeStatus);
    if (feeMonth) next.set("feeMonth", feeMonth);
    if (feeYear) next.set("feeYear", feeYear);
    if (sortKey && sortKey !== "newest") next.set("sort", sortKey);
    if (target > 1) next.set("page", String(target));
    const queryString = next.toString();
    return queryString ? `/dashboard/students?${queryString}` : "/dashboard/students";
  }

  return <main className="app-page px-4 py-5 text-slate-900 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><BackLink /><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">People</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Students</h1><p className="mt-2 text-slate-500">Student photos are managed by teachers from their assigned class rosters.</p></div><div className="flex flex-wrap gap-2"><Link href="/dashboard/students/new" className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-500">Add student</Link><Link href="/dashboard/students/requests" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700 hover:bg-blue-100">Review requests  </Link></div></div><form className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" method="get">{presentOn ? <input type="hidden" name="presentOn" defaultValue={presentOn} /> : null}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="block text-sm font-medium sm:col-span-2 lg:col-span-4">Search students<input name="search" defaultValue={search} placeholder="Name, student ID, CNIC, roll number, father name, or phone" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500" /><span className="mt-1 block text-xs font-normal text-slate-400">Several words must all match — each word may hit a different field.</span></label><label className="block text-sm font-medium">Class<select name="className" defaultValue={className} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="">All classes</option>{classOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="block text-sm font-medium">Section<select name="section" defaultValue={section} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="">All sections</option>{sectionOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="block text-sm font-medium">Gender<select name="gender" defaultValue={gender} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="">Any gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label><label className="block text-sm font-medium">Account status<select name="status" defaultValue={statusFilter} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="active">Approved</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></select></label><label className="block text-sm font-medium">Sort by<select name="sort" defaultValue={sortKey || "newest"} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="class">Class &amp; roll number</option></select></label><label className="block text-sm font-medium">Admitted from<input type="date" name="from" defaultValue={from} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /></label><label className="block text-sm font-medium">Admitted to<input type="date" name="to" defaultValue={to} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /></label><label className="block text-sm font-medium">Fee status<select name="feeStatus" defaultValue={feeStatus} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="">Any fee status</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></label><label className="block text-sm font-medium">Fee month<select name="feeMonth" defaultValue={feeMonth} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="">Any month</option>{["January","February","March","April","May","June","July","August","September","October","November","December"].map((month) => <option key={month} value={month}>{month}</option>)}</select></label><label className="block text-sm font-medium">Fee year<input name="feeYear" inputMode="numeric" placeholder="2026" defaultValue={feeYear} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /></label><label className="block text-sm font-medium">Attendance date<input type="date" name="presentOn" defaultValue={presentOn} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /></label><label className="block text-sm font-medium">Attendance status<select name="attendanceStatus" defaultValue={attendanceStatus} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option><option value="holiday">Holiday</option></select></label><div className="flex flex-wrap items-end gap-3"><button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Apply filters</button>{hasFilters && <Link href="/dashboard/students" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear all</Link>}</div></div></form><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">{presentOn ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Filtered to students marked <span className="font-semibold text-emerald-700">present</span> on <span className="font-semibold text-slate-800">{presentOnLabel}</span>.</p><Link href="/dashboard/students" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Show all students</Link></div> : <p className="text-sm text-slate-500">{total ? `Showing page ${page} of ${pages} · ${total} student${total === 1 ? "" : "s"}${hasFilters ? " matching your filters" : ""}` : hasFilters ? "0 students match your filters" : "0 approved students"}</p>}</div>{students.length === 0 ? <div className="px-6 py-16 text-center sm:py-20"><p className="font-semibold text-slate-700">{hasFilters ? "No students match your filters" : "No approved students found"}</p><p className="mt-1 text-sm text-slate-400">{hasFilters ? "Try adjusting or clearing the filters." : "Pending teacher requests appear in Review requests."}</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 sm:px-6 sm:py-4">Student</th><th className="px-4 py-3 sm:px-6 sm:py-4">Student ID</th><th className="px-4 py-3 sm:px-6 sm:py-4">Class</th><th className="px-4 py-3 sm:px-6 sm:py-4">Roll number</th>  <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th><th className="px-4 py-3 sm:px-6 sm:py-4">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{students.map((student) => <tr key={String(student._id)} className="hover:bg-slate-50"><td className="px-4 py-3 sm:px-6 sm:py-4"><Link href={`/dashboard/students/${String(student._id)}`} className="font-semibold text-blue-700 hover:underline">{student.fullName}</Link><p className="mt-1 text-xs text-slate-400">{student.cnic}</p></td><td className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">{student.studentId}</td><td className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">{student.class}-{student.section}</td><td className="px-4 py-3 sm:px-6 sm:py-4 text-slate-600">{student.rollNumber}</td>  <td className="px-4 py-3 sm:px-6 sm:py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${student.accountStatus === "active" ? "bg-emerald-50 text-emerald-700" : student.accountStatus === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{student.accountStatus}</span></td><td className="px-4 py-3 sm:px-6 sm:py-4"><DeleteButton endpoint={`/api/students/${String(student._id)}`} /></td></tr>)}</tbody></table></div>}<div className="border-t border-slate-100 px-4 py-3 sm:px-6 sm:py-4">{students.length > 0 && <Pagination page={page} pages={pages} hrefFor={studentsHref} />}</div></div></div></main>;
}
