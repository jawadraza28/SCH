import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { formatCount } from "@/components/charts/palette";
import BackLink from "@/components/BackLink";
import {
  type ClassNeedsAttention,
  type PresentStudent,
  unmarkedClassesBySection,
  todayPresentStudents,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  leave: "On leave",
  holiday: "Holiday",
  unmarked: "Not marked",
};

function classSectionParts(classSection: string): [string, string] {
  const [className, section = ""] = classSection.split("-");
  return [className, section];
}

export default async function TodayAttendanceDetail({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; search?: string; classSection?: string; page?: string }>;
}) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();

  const params = await searchParams;
  const view = params.view === "unmarked" ? "unmarked" : "present";
  const today = new Date().toISOString().slice(0, 10);
  const rawSearch = params.search?.trim() ?? "";
  const rawClass = params.classSection?.trim().toUpperCase() ?? "";

  const [presentStudents, unmarkedClasses] = await Promise.all([
    todayPresentStudents(),
    unmarkedClassesBySection(30),
  ]);

  // Filter present students
  let filteredStudents = presentStudents;
  if (rawClass) {
    filteredStudents = filteredStudents.filter((student) => student.classSection === rawClass);
  }
  if (rawSearch) {
    const needle = rawSearch.toLowerCase();
    filteredStudents = filteredStudents.filter(
      (student) =>
        student.fullName.toLowerCase().includes(needle) ||
        (student.studentId ?? "").toLowerCase().includes(needle) ||
        student.rollNumber.toLowerCase().includes(needle) ||
        student.classSection.toLowerCase().includes(needle),
    );
  }

  // Filter unmarked classes
  let filteredUnmarked = unmarkedClasses.filter((item) => item.unmarked > 0);
  if (rawClass) {
    filteredUnmarked = filteredUnmarked.filter((item) => item.classSection === rawClass);
  }
  if (rawSearch) {
    const needle = rawSearch.toLowerCase();
    filteredUnmarked = filteredUnmarked.filter(
      (item) =>
        item.classSection.toLowerCase().includes(needle) ||
        item.classSection.toLowerCase().includes(needle),
    );
  }

  const presentCount = filteredStudents.length;
  const unmarkedTotal = filteredUnmarked.reduce((sum, item) => sum + item.unmarked, 0);

  // Build a class-section dropdown of all classes seen in either data set
  const allClasses = Array.from(
    new Set([...filteredStudents.map((s) => s.classSection), ...filteredUnmarked.map((c) => c.classSection)]),
  ).sort();

  function searchHref(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    if (overrides.view !== undefined) next.set("view", overrides.view);
    else next.set("view", view);
    if (overrides.search !== undefined) {
      if (overrides.search) next.set("search", overrides.search);
    } else if (rawSearch) {
      next.set("search", rawSearch);
    }
    if (overrides.classSection !== undefined) {
      if (overrides.classSection) next.set("classSection", overrides.classSection);
    } else if (rawClass) {
      next.set("classSection", rawClass);
    }
    return `/dashboard/analytics/today?${next.toString()}`;
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <BackLink href="/dashboard/analytics">Back to analytics</BackLink>

        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-baseline">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
              Today&apos;s attendance drill-down
            </p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Attendance detail</h1>
            <p className="mt-2 max-w-2xl text-slate-500">
              Drill into the students and classes behind the analytics donut. Use the tabs to switch
              between students marked present today and classes that still have unmarked registers.
            </p>
          </div>
          <a
            href={`/api/reports/attendance?from=${today}&to=${today}&format=csv&classSection=${encodeURIComponent(rawClass)}&student=${encodeURIComponent(rawSearch)}`}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Export CSV
          </a>
        </div>

        {/* View tabs */}
        <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
          <Link
            href={searchHref({ view: "present" })}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              view === "present"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Present students ({formatCount(presentCount)})
          </Link>
          <Link
            href={searchHref({ view: "unmarked" })}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              view === "unmarked"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Unmarked classes ({formatCount(unmarkedTotal)} students)
          </Link>
        </div>

        {/* Filters */}
        <form method="get" className="mt-6 grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input type="hidden" name="view" value={view} />
          <label className="text-sm font-medium">
            Search
            <input
              name="search"
              defaultValue={rawSearch}
              placeholder={view === "present" ? "Student name, ID, roll number" : "Class section"}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-sm font-medium">
            Class & section
            <select
              name="classSection"
              defaultValue={rawClass}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="">All classes</option>
              {allClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Apply</button>
            <Link href={`/dashboard/analytics/today?view=${view}`} className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-600">
              Reset
            </Link>
          </div>
        </form>

        {/* Present students view */}
        {view === "present" && (
          <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4 sm:px-8 sm:py-5">
              <p className="text-sm text-slate-500">
                {formatCount(presentCount)} student{presentCount === 1 ? " is" : "s are"} present today{rawClass || rawSearch ? ` (filtered)` : ""}
              </p>
            </div>
            {presentCount === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-400 sm:px-8 sm:py-20">
                No students found for the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="stack-table w-full text-left text-sm md:min-w-[820px]">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Student</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Student ID</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Roll #</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Class</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Gender</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((student) => (
                      <tr key={student.id}>
                        <td data-label="Student" data-full className="px-4 py-3 sm:px-6 sm:py-4">
                          <Link
                            href={`/dashboard/students/${student.id}`}
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            {student.fullName}
                          </Link>
                        </td>
                        <td data-label="Student ID" className="px-4 py-3 sm:px-6 sm:py-4 tabular-nums">{student.studentId || "-"}</td>
                        <td data-label="Roll #" className="px-4 py-3 sm:px-6 sm:py-4 tabular-nums">{student.rollNumber}</td>
                        <td data-label="Class" className="px-4 py-3 sm:px-6 sm:py-4">{student.classSection}</td>
                        <td data-label="Gender" className="px-4 py-3 sm:px-6 sm:py-4 capitalize">{student.gender ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Unmarked classes view */}
        {view === "unmarked" && (
          <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4 sm:px-8 sm:py-5">
              <p className="text-sm text-slate-500">
                {formatCount(filteredUnmarked.length)} class{filteredUnmarked.length === 1 ? "" : "es"} with unmarked attendance
              </p>
            </div>
            {filteredUnmarked.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-400 sm:px-8 sm:py-20">
                All classes have full attendance marked in the last 30 days.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="stack-table w-full text-left text-sm md:min-w-[820px]">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Class section</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Students</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Marked</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Unmarked</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Rate</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUnmarked.map((item) => {
                      const [className, section] = classSectionParts(item.classSection);
                      const rate = item.rate;
                      const rateColor = rate >= 85 ? "text-emerald-600" : rate >= 60 ? "text-amber-600" : "text-rose-600";
                      return (
                        <tr key={item.classSection}>
                          <td data-label="Class" className="px-4 py-3 sm:px-6 sm:py-4 font-semibold">{item.classSection}</td>
                          <td data-label="Students" className="px-4 py-3 sm:px-6 sm:py-4 text-right tabular-nums">{formatCount(item.students)}</td>
                          <td data-label="Marked" className="px-4 py-3 sm:px-6 sm:py-4 text-right tabular-nums">{formatCount(item.marked)}</td>
                          <td data-label="Unmarked" className="px-4 py-3 sm:px-6 sm:py-4 text-right tabular-nums text-rose-600">{formatCount(item.unmarked)}</td>
                          <td data-label="Rate" className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                            <span className={`font-semibold ${rateColor}`}>{rate}%</span>
                          </td>
                          <td data-label="Action" className="px-4 py-3 sm:px-6 sm:py-4">
                            <Link
                              href={`/dashboard/attendance?class=${encodeURIComponent(className)}&section=${encodeURIComponent(section)}`}
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              Mark →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
