import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection } from "@/Models";
import BackLink from "@/components/BackLink";
import ClassActions from "@/components/ClassActions";
import TimetableEditor from "@/components/TimetableEditor";

export const dynamic = "force-dynamic";

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  const { id } = await params;
  await connectToDatabase();
  const classSection = await ClassSection.findById(id).lean();
  if (!classSection || !classSection.isActive) notFound();
  const className = `${classSection.className}-${classSection.sectionName}`;
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><BackLink /><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Class management</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">{className}</h1><p className="mt-2 text-slate-500">Manage this class timetable for academic year {classSection.academicYear}.</p></div><Link href={`/dashboard/students?className=${encodeURIComponent(classSection.className)}&section=${encodeURIComponent(classSection.sectionName)}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700">View students</Link><ClassActions id={String(classSection._id)} label={className} /></div><TimetableEditor scope="class" target={className} academicYear={classSection.academicYear} /></div></main>;
}
