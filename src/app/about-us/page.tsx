import Link from "next/link";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { signedR2Url } from "@/lib/object-storage";
import LandingNav from "@/components/LandingNav";

export const dynamic = "force-dynamic";

export default async function AboutUsPage() {
  let school: { schoolName?: string; schoolDescription?: string; schoolAddress?: string; schoolPhone?: string; schoolEmail?: string; academicYear?: string; schoolIcon?: string } | null = null;
  try {
    await connectToDatabase();
    school = await SchoolConfiguration.findOne().sort({ updatedAt: -1, createdAt: -1 }).select("schoolName schoolDescription schoolAddress schoolPhone schoolEmail academicYear schoolIcon").lean();
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
      <LandingNav schoolName={schoolName} schoolIcon={schoolIcon} />
      <section className="public-page mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-10 sm:pb-24 sm:pt-20">
        <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400 sm:text-sm sm:tracking-[0.22em]">About our school</p><h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:mt-5 sm:text-7xl">{schoolName}</h1><p className="mt-5 text-base leading-7 text-slate-400 sm:mt-7 sm:text-lg sm:leading-8">{description}</p></div>
        <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-3 sm:gap-5">
          <article className="public-card border-blue-300/20"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Our focus</p><h2 className="mt-3 text-xl font-semibold">Learning with purpose</h2><p className="mt-3 text-sm leading-6 text-slate-400">Teachers, students, and families share a clear view of the work that matters.</p></article>
          <article className="public-card border-emerald-300/20"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Our community</p><h2 className="mt-3 text-xl font-semibold">People first</h2><p className="mt-3 text-sm leading-6 text-slate-400">Every record and update helps the people around each learner stay connected.</p></article>
          <article className="public-card border-amber-300/20"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Our promise</p><h2 className="mt-3 text-xl font-semibold">A clearer school day</h2><p className="mt-3 text-sm leading-6 text-slate-400">Attendance, homework, results, notices, and fees stay easy to reach on any device.</p></article>
        </div>
        <div className="mt-8 grid gap-5 border-t border-white/10 pt-8 sm:mt-10 sm:grid-cols-2 sm:gap-8 sm:pt-10">
          <div className="public-detail"><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">School details</h2><dl className="mt-4 space-y-4 text-sm text-slate-300"><div className="flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-slate-500">Academic year</dt><dd>{school?.academicYear || "Being prepared"}</dd></div><div className="flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-slate-500">Address</dt><dd className="sm:text-right">{school?.schoolAddress || "Contact the school"}</dd></div></dl></div>
          <div className="public-detail"><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Contact</h2><p className="mt-4 text-sm leading-7 text-slate-300">{school?.schoolPhone || "Phone details will appear after setup."}<br />{school?.schoolEmail || "Email details will appear after setup."}</p><Link href="/contact" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-50">Contact the school</Link></div>
        </div>
      </section>
    </main>
  );
}
