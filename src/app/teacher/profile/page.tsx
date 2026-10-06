import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration, Teacher } from "@/Models";
import TeacherPhotoUpload from "./TeacherPhotoUpload";

export const dynamic = "force-dynamic";

const formatDate = (value: string | Date | undefined | null): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export default async function TeacherProfilePage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "teacher") redirect(session.user.role === "student" ? "/student" : "/dashboard");
  await connectToDatabase();
  const [teacher, school] = await Promise.all([
    Teacher.findOne({ cnic: session.user.cnic }).lean(),
    session.user.school ? SchoolConfiguration.findById(session.user.school).select("schoolName schoolAddress schoolPhone schoolEmail").lean() : null,
  ]);
  const classes: string[] = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item).toUpperCase()).filter(Boolean) : [];
  const sections: string[] = Array.isArray(teacher?.assignedSections) ? teacher.assignedSections.map((item: unknown) => String(item).toUpperCase()).filter(Boolean) : [];
  const joinedSections = Array.from(new Set([...classes, ...sections]));
  const initials = session.user.name.split(" ").map((part: string) => part.charAt(0)).slice(0, 2).join("").toUpperCase();
  const statusKey = (teacher?.accountStatus ?? "active") as "active" | "inactive" | "pending";
  const statusColor = {
    active: "text-emerald-700",
    inactive: "text-rose-700",
    pending: "text-amber-700",
  }[statusKey] ?? "text-slate-600";

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/teacher" className="text-sm font-medium text-blue-600">← Teacher workspace</Link>
        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="bg-blue-700 p-6 text-white sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200 sm:text-sm">
              {school?.schoolName || "School"} · Teacher profile
            </p>
            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
              <TeacherPhotoUpload initials={initials} hasPhoto={Boolean(teacher?.profilePhotoUrl)} />
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{teacher?.name || session.user.name}</h1>
                <p className="mt-2 text-blue-100">
                  {teacher?.subject || "Teaching faculty"} · {teacher?.gender || "Gender not set"} · {joinedSections.length} assigned class{joinedSections.length === 1 ? "" : "es"}{" "}
                  {joinedSections.length === 0 ? "section" : "section" + (joinedSections.length === 1 ? "" : "s")}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 p-6 sm:grid-cols-2 sm:p-9">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Personal details</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <ProfileRow label="Teacher ID" value={teacher?.teacherId || "-"} />
                <ProfileRow label="Date of birth" value={formatDate(teacher?.dateOfBirth)} />
                <ProfileRow label="Date of joining" value={formatDate(teacher?.dateOfJoining)} />
                <ProfileRow label="Salary (monthly)" value={teacher?.salary ? `Rs ${Number(teacher.salary).toLocaleString()}` : "-"} />
                <ProfileRow label="Gender" value={teacher?.gender ? <span className="capitalize">{teacher.gender}</span> : "-"} />
              </dl>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Contact details</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <ProfileRow label="Email" value={session.user.email || "-"} />
                <ProfileRow label="CNIC" value={teacher?.cnic || session.user.cnic || "-"} />
                <ProfileRow label="Phone" value={teacher?.phone || "-"} />
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <dt className="text-slate-500">Status</dt>
                  <dd className={`capitalize font-semibold ${statusColor}`}>{teacher?.accountStatus || "active"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="px-6 pb-6 sm:px-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Assigned classes &amp; sections</h2>
            {joinedSections.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {joinedSections.map((item) => (
                  <Link
                    key={item}
                    href={`/teacher/students?classSection=${encodeURIComponent(item)}`}
                    className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    {item}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                No classes assigned yet. Ask an administrator to update your teaching schedule.
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 px-6 py-6 sm:px-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Account</h2>
            <dl className="mt-4 space-y-4 text-sm sm:grid sm:grid-cols-2">
              <ProfileRow label="Account created" value={formatDate(teacher?.createdAt)} />
              <ProfileRow label="Last updated" value={formatDate((teacher as unknown as { updatedAt?: string })?.updatedAt)} />
            </dl>
          </div>

          <div className="border-t border-slate-100 px-6 py-6 sm:px-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">School contact</h2>
            <p className="mt-3 text-sm text-slate-600">{school?.schoolName}</p>
            <p className="mt-1 text-sm text-slate-600">{school?.schoolAddress || "Address not provided"}</p>
            <p className="mt-1 text-sm text-slate-600">{school?.schoolPhone || "Phone not provided"}</p>
            <p className="mt-1 text-sm text-slate-600 break-all">{school?.schoolEmail || "Email not provided"}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right break-words">{value}</dd>
    </div>
  );
}
