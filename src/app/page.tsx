import Link from "next/link";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import LandingNav from "@/components/LandingNav";

export const dynamic = "force-dynamic";

export default async function Home() {
  let school: { schoolName?: string; schoolDescription?: string } | null = null;
  try {
    await connectToDatabase();
    school = await SchoolConfiguration.findOne()
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("schoolName schoolDescription")
      .lean();
  } catch {
    // The public page remains useful while first-time setup is being prepared.
  }

  const schoolName = school?.schoolName || "Your School";
  const description = school?.schoolDescription || "One clear place for attendance, learning, communication, and progress.";
  return (
    <main className="landing-page min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <section className="relative grid w-full gap-8 overflow-hidden px-4 pb-14 pt-10 sm:gap-12 sm:px-10 sm:pb-20 sm:pt-16 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:pb-28 lg:pt-24"><img src="/landingcover.png" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" /><div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative z-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400 sm:text-sm sm:tracking-[0.22em]">Welcome to your school</p><h1 className="mt-4 max-w-3xl text-3xl font-bold leading-[1.1] tracking-tight sm:mt-6 sm:text-6xl">{schoolName}</h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-400 sm:mt-7 sm:text-lg sm:leading-8">{description}</p><div className="mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row"><Link href="/login" className="rounded-xl bg-blue-500 px-6 py-3.5 text-center font-semibold text-white hover:bg-blue-400">Open your workspace</Link><Link href="/about-us" className="rounded-xl border border-white/15 px-6 py-3.5 text-center font-semibold text-slate-200 hover:bg-white/5">Discover our school</Link></div></div>
        <div className="school-illustration" aria-hidden="true"><div className="illustration-glow" /><div className="illustration-building"><span className="illustration-building-roof" /><span className="illustration-building-body"><i /><i /><i /></span><span className="illustration-building-door" /></div><div className="illustration-book illustration-book-one" /><div className="illustration-book illustration-book-two" /><div className="illustration-globe"><span /><i /></div><div className="illustration-pencil" /></div>
      </section>
      <section className="border-t border-white/10 bg-slate-900/70"><div className="mx-auto max-w-7xl px-6 py-12 sm:px-10"><div className="grid gap-4 sm:grid-cols-3"><Link href="/login" className="landing-feature"><span className="landing-feature-number">01</span><p className="text-sm font-semibold text-white">For administrators</p><p className="mt-2 text-sm leading-6 text-slate-400">See the whole school, make decisions faster, and keep records organized.</p><span className="mt-5 block text-xs font-semibold text-blue-300">Open workspace →</span></Link><Link href="/login" className="landing-feature"><span className="landing-feature-number">02</span><p className="text-sm font-semibold text-white">For teachers</p><p className="mt-2 text-sm leading-6 text-slate-400">Spend less time on paperwork and more time with your classes.</p><span className="mt-5 block text-xs font-semibold text-emerald-300">Open workspace →</span></Link><Link href="/login" className="landing-feature"><span className="landing-feature-number">03</span><p className="text-sm font-semibold text-white">For students</p><p className="mt-2 text-sm leading-6 text-slate-400">Keep attendance, homework, results, notices, and fees close at hand.</p><span className="mt-5 block text-xs font-semibold text-amber-300">Open workspace →</span></Link></div></div></section>
      <footer className="border-t border-white/10 px-6 py-8 sm:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p>{schoolName} · A clearer school day.</p><div className="flex gap-4"><Link href="/about-us" className="hover:text-white">About us</Link><Link href="/contact" className="hover:text-white">Contact</Link><Link href="/login" className="hover:text-white">Sign in</Link></div></div></footer>
    </main>
  );
}
