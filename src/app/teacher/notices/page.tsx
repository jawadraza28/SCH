import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Notice } from "@/Models";

export const dynamic = "force-dynamic";

export default async function TeacherNoticesPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "teacher") redirect("/dashboard");
  await connectToDatabase();
  const notices = await Notice.find({ published: true, $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: new Date() } }] }).sort({ publishDate: -1 }).limit(50).lean();
  return <main className="min-h-screen bg-slate-100 px-6 py-8 text-slate-900 sm:px-10"><div className="mx-auto max-w-4xl"><a href="/teacher" className="text-sm font-medium text-blue-600">← Teacher workspace</a><h1 className="mt-6 text-3xl font-bold">Notice board</h1><p className="mt-2 text-slate-500">Announcements published by your school administrator.</p><section className="mt-8 space-y-4">{notices.length ? notices.map((notice) => <article key={String(notice._id)} className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{notice.type}</p><h2 className="mt-2 text-xl font-semibold">{notice.title}</h2><time className="mt-2 block text-sm text-slate-400">{new Date(notice.publishDate).toLocaleDateString()}</time><p className="mt-4 whitespace-pre-wrap leading-7 text-slate-600">{notice.description}</p></article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center text-sm text-slate-400">No notices available.</div>}</section></div></main>;
}
