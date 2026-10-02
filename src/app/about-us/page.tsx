import Link from "next/link";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { signedR2Url } from "@/lib/object-storage";

export const dynamic = "force-dynamic";

export default async function AboutUsPage() {
  let school: { schoolName?: string; schoolDescription?: string; schoolAddress?: string; schoolPhone?: string; schoolEmail?: string; academicYear?: string; schoolIcon?: string } | null = null;
  try {
    await connectToDatabase();
    school = await SchoolConfiguration.findOne().select("schoolName schoolDescription schoolAddress schoolPhone schoolEmail academicYear").lean();
  } catch {
    // The page can still explain the product before setup is complete.
  }

  const schoolName = school?.schoolName || "Your School";
  const description = school?.schoolDescription || "A connected school community built around clear communication, thoughtful teaching, and confident learning.";
  let schoolIcon = "";
  if (school?.schoolIcon?.startsWith("r2://")) {
    try { schoolIcon = await signedR2Url(school.schoolIcon); } catch (error) { console.error("About page icon URL error:", error); }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-3 text-sm font-bold tracking-wide"><span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-500 text-lg">{schoolIcon ? <img src={schoolIcon} alt="" className="h-full w-full object-cover" /> : schoolName.charAt(0).toUpperCase()}</span><span className="truncate">{schoolName}</span></Link>
        <div className="flex items-center gap-2"><Link href="/contact" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white">Contact</Link><Link href="/login" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-50">Sign in</Link></div>
      </nav>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:px-10 sm:pt-24">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">About our school</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-bold leading-tight tracking-tight sm:text-7xl">{schoolName}</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-400">{description}</p>
        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Our focus</p><h2 className="mt-3 text-xl font-semibold">Learning with purpose</h2><p className="mt-3 text-sm leading-6 text-slate-400">We give teachers, students, and families a shared view of the work that matters.</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Our community</p><h2 className="mt-3 text-xl font-semibold">People first</h2><p className="mt-3 text-sm leading-6 text-slate-400">Every record and update helps the people around each learner stay connected.</p></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Our promise</p><h2 className="mt-3 text-xl font-semibold">A clearer school day</h2><p className="mt-3 text-sm leading-6 text-slate-400">Simple access to attendance, homework, results, notices, and fees from any device.</p></article>
        </div>
        <div className="mt-8 grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-2">
          <div><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">School details</h2><dl className="mt-4 space-y-3 text-sm text-slate-300"><div className="flex justify-between gap-4 border-b border-white/10 pb-3"><dt className="text-slate-500">Academic year</dt><dd>{school?.academicYear || "Being prepared"}</dd></div><div className="flex justify-between gap-4 border-b border-white/10 pb-3"><dt className="text-slate-500">Address</dt><dd className="text-right">{school?.schoolAddress || "Contact the school"}</dd></div></dl></div>
          <div><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Contact</h2><p className="mt-4 text-sm leading-7 text-slate-300">{school?.schoolPhone || "Phone details will appear after setup."}<br />{school?.schoolEmail || "Email details will appear after setup."}</p></div>
        </div>
      </section>
    </main>
  );
}
