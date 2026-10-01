import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Notice } from "@/Models";

export const dynamic = "force-dynamic";

export default async function StudentNoticesPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "student") redirect("/dashboard");
  await connectToDatabase();
  const notices = await Notice.find({ published: true, $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: new Date() } }] }).sort({ publishDate: -1 }).limit(50).lean();
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-4xl"><a href="/student" className="text-sm font-medium text-blue-600">← Student portal</a><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Notice board</h1><p className="mt-2 text-slate-500">Announcements from your school.</p><section className="mt-8 space-y-4">{notices.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">No notices available.</div> : notices.map((notice) => <article key={String(notice._id)} className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex justify-between gap-4"><div><span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">{notice.type}</span><h2 className="mt-3 text-xl font-semibold">{notice.title}</h2></div><time className="text-sm text-slate-400">{new Date(notice.publishDate).toLocaleDateString()}</time></div><p className="mt-4 whitespace-pre-wrap leading-7 text-slate-600">{notice.description}</p></article>)}</section></div></main>;
}
