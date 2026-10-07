import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Student, TeacherAttendance } from "@/Models";
import { buildAttendanceDateFilter } from "@/lib/attendance";
import { compareClassSections } from "@/lib/analytics";
import BackLink from "@/components/BackLink";
import { formatCount, STATUS_COLOR, STATUS_LABEL } from "@/components/charts/palette";
import FilterChips from "@/components/FilterChips";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const validDate = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value as string : "";
const REPORT_STATUSES = ["present", "late", "absent", "leave", "holiday"] as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reportHref(params: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  return `/dashboard/reports/attendance?${next.toString()}`;
}

function attended(counts: Record<string, number>) {
  return (counts.present ?? 0) + (counts.late ?? 0);
}

function statusChipClass(status: string): string {
  switch (status) {
    case "present": return "bg-emerald-100 text-emerald-800";
    case "late": return "bg-amber-100 text-amber-800";
    case "absent": return "bg-rose-100 text-rose-800";
    case "leave": return "bg-violet-100 text-violet-800";
    case "holiday": return "bg-slate-100 text-slate-800";
    default: return "bg-slate-100 text-slate-800";
  }
}

interface DetailRecord {
  type: "student" | "teacher";
  name: string;
  idLabel: string;
  idValue: string;
  classSection: string;
  date: string;
  status: string;
}

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    month?: string;
    classSection?: string;
    student?: string;
    status?: string;
    tab?: string;
    page?: string;
  }>;
}) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = validDate(params.from) || "";
  const to = validDate(params.to) || "";
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : "";
  const classSection = params.classSection?.trim().toUpperCase() ?? "";
  const studentSearch = params.student?.trim() ?? "";
  const status = REPORT_STATUSES.includes(params.status as (typeof REPORT_STATUSES)[number]) ? params.status! : "";
  const tab = params.tab === "records" ? "records" : "summary";

  const filter = buildAttendanceDateFilter({ month, from, to });
  const effectiveDate = filter.date ?? { $gte: new Date(`${today}T00:00:00.000Z`), $lte: new Date(`${today}T23:59:59.999Z`) };

  // Resolve student IDs when searching by name
  let studentIdFilter: string[] | undefined;
  if (studentSearch) {
    const regex = new RegExp(escapeRegex(studentSearch), "i");
    const matched = await Student.find({
      $or: [{ fullName: regex }, { studentId: regex }, { rollNumber: regex }, { cnic: regex }],
    }).select("_id").lean();
    studentIdFilter = matched.map((s) => String(s._id));
  }

  // Build match objects
  const studentMatch: Record<string, unknown> = { date: effectiveDate };
  if (classSection) studentMatch.classSection = classSection;
  if (status) studentMatch.status = status;
  if (studentIdFilter !== undefined) studentMatch.student = { $in: studentIdFilter };

  const teacherMatch: Record<string, unknown> = { date: effectiveDate };
  if (status) teacherMatch.status = status;

  // Distinct class sections for the dropdown
  const classAgg = await Student.aggregate<{ _id: { class: string; section: string } }>([
    { $match: { accountStatus: { $in: ["active", "pending"] } } },
    { $group: { _id: { class: { $toUpper: { $ifNull: ["$class", ""] } }, section: { $toUpper: { $ifNull: ["$section", ""] } } } } },
  ]);
  const availableSections = classAgg
    .map((row) => `${row._id.class}-${row._id.section}`.replace(/-+$/, ""))
    .filter(Boolean)
    .sort(compareClassSections);

  // Summary counts by status
  const [studentStatusCounts, teacherStatusCounts] = await Promise.all([
    Attendance.aggregate<{ _id: string; total: number }>([
      { $match: studentMatch },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]),
    TeacherAttendance.aggregate<{ _id: string; total: number }>([
      { $match: teacherMatch },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]),
  ]);

  const studentCounts: Record<string, number> = {};
  for (const row of studentStatusCounts) studentCounts[row._id] = row.total;
  const teacherCounts: Record<string, number> = {};
  for (const row of teacherStatusCounts) teacherCounts[row._id] = row.total;

  const studentTotalMarked = REPORT_STATUSES.reduce((sum, s) => sum + (studentCounts[s] ?? 0), 0);
  const teacherTotalMarked = REPORT_STATUSES.reduce((sum, s) => sum + (teacherCounts[s] ?? 0), 0);

  // Export URL
  const exportParams = new URLSearchParams();
  if (month) exportParams.set("month", month);
  else {
    exportParams.set("from", from || today);
    exportParams.set("to", to || today);
  }
  if (classSection) exportParams.set("classSection", classSection);
  if (studentSearch) exportParams.set("student", studentSearch);
  if (status) exportParams.set("status", status);
  const exportUrl = `/api/reports/attendance?${exportParams.toString()}`;

  // Active filter chips
  const activeFilters: Array<{ label: string; value: string }> = [];
  if (month) {
    const monthDate = new Date(`${month}-01T00:00:00.000Z`);
    activeFilters.push({ label: "Month", value: monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) });
  } else if (from || to) {
    activeFilters.push({ label: "Range", value: `${from || "-"} to ${to || "-"}` });
  }
  if (classSection) activeFilters.push({ label: "Class", value: classSection });
  if (studentSearch) activeFilters.push({ label: "Student", value: studentSearch });
  if (status) activeFilters.push({ label: "Status", value: STATUS_LABEL[status as keyof typeof STATUS_LABEL] || status });

  const clearUrl = "/dashboard/reports/attendance";

  // --- Detailed records (records tab) ---
  let records: DetailRecord[] = [];
  let pages = 1;
  let page = 1;
  let recordsTotal = 0;
  const limit = DEFAULT_PAGE_SIZE;

  if (tab === "records") {
    recordsTotal = await Attendance.countDocuments(studentMatch);
    pages = countPages(recordsTotal, limit);
    page = clampPage(parsePageNumber(params.page), pages);

    if (studentIdFilter === undefined || studentIdFilter.length > 0) {
      const studentResult = await Attendance.find(studentMatch)
        .populate("student", "fullName studentId rollNumber")
        .select("date status classSection student")
        .sort({ date: -1, classSection: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      records = studentResult.map((row) => {
        const student = row.student as { fullName?: string; studentId?: string; rollNumber?: string } | null;
        return {
          type: "student",
          name: student?.fullName ?? "-",
          idLabel: "Student ID",
          idValue: student?.studentId ?? "-",
          classSection: row.classSection,
          date: new Date(row.date).toISOString().slice(0, 10),
          status: row.status,
        };
      });
    }
  }

  function recordsHref(target: number) {
    const next = new URLSearchParams(params as Record<string, string>);
    next.set("page", String(target));
    next.set("tab", "records");
    return `/dashboard/reports/attendance?${next.toString()}`;
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <BackLink href="/dashboard" />

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Reports</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Attendance report</h1>
            <p className="mt-2 text-slate-500">Review attendance totals for students and teachers over any date range, then drill into per-student records or export the raw data.</p>
          </div>
          <a
            href={exportUrl}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Export CSV
          </a>
        </div>

        {/* Filters */}
        <form method="get" className="mt-8 grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2 sm:gap-5 lg:grid-cols-5 lg:items-end">
          <input type="hidden" name="tab" value={tab} />

          <label className="text-sm font-medium lg:col-span-2">
            Date range
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="date"
                name="from"
                defaultValue={from}
                max={today}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
              />
              <input
                type="date"
                name="to"
                defaultValue={to}
                max={today}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Or pick a single month</p>
            <input
              type="month"
              name="month"
              defaultValue={month}
              max={new Date().toISOString().slice(0, 7)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-sm font-medium">
            Class & section
            <select
              name="classSection"
              defaultValue={classSection}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="">All classes</option>
              {availableSections.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Student search
            <input
              name="student"
              defaultValue={studentSearch}
              placeholder="Name, ID, roll number"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-sm font-medium">
            Status
            <select
              name="status"
              defaultValue={status}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="">All statuses</option>
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2 lg:col-span-5">
            <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Apply filters</button>
            {activeFilters.length > 0 && (
              <Link href={clearUrl} className="text-sm font-semibold text-slate-500 hover:underline">
                Clear all
              </Link>
            )}
          </div>
        </form>

        {activeFilters.length > 0 && <FilterChips items={activeFilters} clearHref={clearUrl} />}

        {/* Tab selector */}
        <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
          <Link
            href={reportHref({ ...params, tab: "summary" })}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === "summary"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Summary
          </Link>
          <Link
            href={reportHref({ ...params, tab: "records", page: undefined })}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === "records"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Detailed records
          </Link>
        </div>

        {/* Summary cards */}
        {tab === "summary" && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REPORT_STATUSES.map((s) => (
                <SummaryCard
                  key={s}
                  label={"Student " + STATUS_LABEL[s]}
                  value={formatCount(studentCounts[s] ?? 0)}
                  colorClass={STATUS_COLOR[s]}
                  sublabel={`${studentTotalMarked} marked`}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REPORT_STATUSES.map((s) => (
                <SummaryCard
                  key={s}
                  label={"Teacher " + STATUS_LABEL[s]}
                  value={formatCount(teacherCounts[s] ?? 0)}
                  colorClass={STATUS_COLOR[s]}
                  sublabel={`${teacherTotalMarked} marked`}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              <SummaryCard
                label="Student rate"
                value={`${studentTotalMarked ? Math.round((attended(studentCounts) / studentTotalMarked) * 100) : 0}%`}
                colorClass="text-slate-700"
                sublabel="Present + late vs marked"
              />
              <SummaryCard
                label="Teacher rate"
                value={`${teacherTotalMarked ? Math.round((attended(teacherCounts) / teacherTotalMarked) * 100) : 0}%`}
                colorClass="text-slate-700"
                sublabel="Present + late vs marked"
              />
            </div>
          </>
        )}

        {/* Detailed records table */}
        {tab === "records" && (
          <div className="mt-6 rounded-2xl bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4 sm:px-8 sm:py-5">
              <p className="text-sm text-slate-500">
                {recordsTotal} record{recordsTotal === 1 ? "" : "s"} · page {page} of {pages}
              </p>
            </div>
            {records.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-400 sm:px-8 sm:py-20">
                No attendance records match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="stack-table w-full text-left text-sm md:min-w-[820px]">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Type</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Name</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">{records[0]?.idLabel || "ID"}</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Class section</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Date</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((record, index) => (
                      <tr key={`${record.type}-${index}`}>
                        <td data-label="Type" className="px-4 py-3 sm:px-6 sm:py-4 capitalize">
                          {record.type}
                        </td>
                        <td data-label="Name" className="px-4 py-3 sm:px-6 sm:py-4 font-semibold text-blue-700">
                          {record.name}
                        </td>
                        <td data-label={record.idLabel} className="px-4 py-3 sm:px-6 sm:py-4 tabular-nums">
                          {record.idValue || "-"}
                        </td>
                        <td data-label="Class section" className="px-4 py-3 sm:px-6 sm:py-4">
                          {record.classSection || "-"}
                        </td>
                        <td data-label="Date" className="px-4 py-3 sm:px-6 sm:py-4 tabular-nums">
                          {record.date}
                        </td>
                        <td data-label="Status" className="px-4 py-3 sm:px-6 sm:py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusChipClass(record.status)}`}
                          >
                            {STATUS_LABEL[record.status as keyof typeof STATUS_LABEL] || record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {recordsTotal > limit && (
              <div className="border-t border-slate-100 px-6 py-4 sm:px-8">
                <Pagination page={page} pages={pages} hrefFor={recordsHref} />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  colorClass,
  sublabel,
}: {
  label: string;
  value: string;
  colorClass: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${colorClass}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-400">{sublabel}</p>
    </div>
  );
}
