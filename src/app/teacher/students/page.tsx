import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student, Teacher } from "@/Models";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, clampPage, countPages, parsePageNumber } from "@/lib/pagination";
import PhotoUpload from "./PhotoUpload";
import DeleteButton from "@/components/DeleteButton";

export const dynamic = "force-dynamic";

// Escape user input before it is used inside a MongoDB regex.
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; classSection?: string; page?: string }>;
}) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "teacher") redirect("/dashboard");

  await connectToDatabase();

  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
  const assignedClasses: string[] = Array.isArray(teacher?.assignedClasses)
    ? teacher.assignedClasses.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean)
    : [];

  const params = await searchParams;
  const rawSearch = params.search?.trim() ?? "";
  const search = escapeRegex(rawSearch);
  const requestedClass = params.classSection?.trim().toUpperCase() ?? "";
  // A teacher can filter only inside the classes an administrator assigned to them.
  const classSection = requestedClass && assignedClasses.includes(requestedClass) ? requestedClass : "";

  const filters: Record<string, unknown>[] = [
    { accountStatus: { $in: ["active", "pending"] } },
    {
      $expr: {
        $in: [
          { $toUpper: { $concat: [{ $ifNull: ["$class", ""] }, "-", { $ifNull: ["$section", ""] }] } },
          assignedClasses,
        ],
      },
    },
  ];

  if (classSection) {
    const [className, ...sectionParts] = classSection.split("-");
    filters.push({ class: className, section: sectionParts.join("-") });
  }

  if (search) {
    filters.push({
      $or: [
        { fullName: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
        { cnic: { $regex: search, $options: "i" } },
        { rollNumber: { $regex: search, $options: "i" } },
      ],
    });
  }

  const limit = DEFAULT_PAGE_SIZE;
  const total = assignedClasses.length ? await Student.countDocuments({ $and: filters }) : 0;
  const pages = countPages(total, limit);
  const page = clampPage(parsePageNumber(params.page), pages);
  const students = assignedClasses.length
    ? await Student.find({ $and: filters }).sort({ class: 1, section: 1, rollNumber: 1 }).skip((page - 1) * limit).limit(limit).lean()
    : [];

  // Keeps the active search and class filter while moving between pages.
  function studentsHref(target: number) {
    const next = new URLSearchParams();
    if (params.search) next.set("search", params.search);
    if (params.classSection) next.set("classSection", params.classSection);
    if (target > 1) next.set("page", String(target));
    const queryString = next.toString();
    return queryString ? `/teacher/students?${queryString}` : "/teacher/students";
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/teacher" className="text-sm font-medium text-blue-600">
          ← Teacher workspace
        </Link>
        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">My students</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold">Students</h1>
            <p className="mt-2 text-slate-500">
              Only students from your Admin-assigned classes and sections are shown, and only these students can be edited.
            </p>
          </div>
          <Link
            href="/teacher/students/new"
            className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Add student request
          </Link>
        </div>

        <form method="get" className="mt-8 grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="text-sm font-medium">
            Search
            <input
              name="search"
              defaultValue={rawSearch}
              placeholder="Search name, student ID, CNIC, or roll number"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-sm font-medium">
            Class and section
            <select
              name="classSection"
              defaultValue={classSection}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="">All my classes</option>
              {assignedClasses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-w-max items-end gap-2">
            <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Apply</button>
            <Link
              href="/teacher/students"
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
            >
              Reset
            </Link>
          </div>
        </form>

        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-sm text-slate-500">
              {total} student{total === 1 ? "" : "s"} shown{total > 0 ? ` · page ${page} of ${pages}` : ""}
              {assignedClasses.length ? ` · Assigned classes: ${assignedClasses.join(", ")}` : ""}
            </p>
          </div>
          {!assignedClasses.length ? (
            <div className="px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">
              No classes have been assigned to you yet. Ask an administrator to assign your classes and sections.
            </div>
          ) : students.length === 0 ? (
            <div className="px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">No students match your search.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Student</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Student ID</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Class</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Gender</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Photo</th>
                    <th className="px-4 py-3 sm:px-6 sm:py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((student) => (
                    <tr key={String(student._id)}>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-semibold">
                        <Link href={`/teacher/students/${String(student._id)}`} className="text-blue-700 hover:underline">{student.fullName}</Link>
                        <p className="mt-1 text-xs font-normal text-slate-400">Roll {student.rollNumber}</p>
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4">{student.studentId}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4">
                        {student.class}-{student.section}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 capitalize">{student.gender ?? "-"}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 capitalize">{student.accountStatus}</td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4"><PhotoUpload studentId={String(student._id)} /></td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4">
                        <Link
                          href={`/teacher/students/${String(student._id)}/edit`}
                          className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                        >
                          Edit
                        </Link>{" "}<DeleteButton endpoint={`/api/students/${String(student._id)}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 && (
            <div className="border-t border-slate-100 px-6 py-4">
              <Pagination page={page} pages={pages} hrefFor={studentsHref} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
