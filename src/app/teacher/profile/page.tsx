import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration, Teacher } from "@/Models";
import TeacherPhotoUpload from "./TeacherPhotoUpload";

export const dynamic = "force-dynamic";

export default async function TeacherProfilePage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "teacher") redirect(session.user.role === "student" ? "/student" : "/dashboard");
  await connectToDatabase();
  const [teacher, school] = await Promise.all([
    Teacher.findOne({ cnic: session.user.cnic }).lean(),
    session.user.school ? SchoolConfiguration.findById(session.user.school).select("schoolName schoolAddress schoolPhone").lean() : null,
  ]);
  const classes: string[] = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item).toUpperCase()) : [];
  const initials = session.user.name.split(" ").map((part: string) => part.charAt(0)).slice(0, 2).join("").toUpperCase();

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/teacher" className="text-sm font-medium text-blue-600">← Teacher workspace</Link>
        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="bg-blue-700 p-6 text-white sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">{school?.schoolName || "School"} · Teacher profile</p><div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center"><TeacherPhotoUpload initials={initials} hasPhoto={Boolean(teacher?.profilePhotoUrl)} /><div><h1 className="text-3xl font-bold tracking-tight">{teacher?.name || session.user.name}</h1><p className="mt-2 text-blue-100">{teacher?.subject || "Teaching faculty"} · {classes.length} assigned class{classes.length === 1 ? "" : "es"}</p></div></div></div>
          <div className="grid gap-8 p-6 sm:grid-cols-2 sm:p-9"><div><h2 className="font-semibold">Contact details</h2><dl className="mt-4 space-y-4 text-sm"><div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Email</dt><dd className="break-all text-right">{session.user.email || "-"}</dd></div><div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">CNIC</dt><dd>{teacher?.cnic || session.user.cnic || "-"}</dd></div><div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Phone</dt><dd>{teacher?.phone || "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="capitalize">{teacher?.accountStatus || "active"}</dd></div></dl></div><div><h2 className="font-semibold">Assigned classes</h2>{classes.length ? <div className="mt-4 flex flex-wrap gap-2">{classes.map((item) => <Link key={item} href={`/teacher/students?classSection=${encodeURIComponent(item)}`} className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">{item} →</Link>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No classes assigned yet. Ask an administrator to update your teaching schedule.</p>}<div className="mt-8 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><p className="font-semibold text-slate-800">School contact</p><p className="mt-2">{school?.schoolAddress || "Address not provided"}</p><p className="mt-1">{school?.schoolPhone || "Phone not provided"}</p></div></div></div>
        </section>
      </div>
    </main>
  );
}