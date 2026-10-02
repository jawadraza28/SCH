import Link from "next/link";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { signedR2Url } from "@/lib/object-storage";

export const dynamic = "force-dynamic";

export default async function Home() {
  let school: { schoolName?: string; schoolDescription?: string; schoolAddress?: string; schoolPhone?: string; coverImage?: string; schoolIcon?: string } | null = null;
  try {
    await connectToDatabase();
    school = await SchoolConfiguration.findOne().select("schoolName schoolDescription schoolAddress schoolPhone coverImage schoolIcon").lean();
  } catch {
    // The public page remains useful while first-time setup is being prepared.
  }

  const schoolName = school?.schoolName || "Your School";
  const description = school?.schoolDescription || "One clear place for attendance, learning, communication, and progress.";
  let coverImage = "";
  let schoolIcon = "";
  if (school?.coverImage?.startsWith("r2://")) { try { coverImage = await signedR2Url(school.coverImage); } catch (error) { console.error("Landing cover image URL error:", error); } }
  if (school?.schoolIcon?.startsWith("r2://")) { try { schoolIcon = await signedR2Url(school.schoolIcon); } catch (error) { console.error("School icon URL error:", error); } }

  return (
    <main className="landing-page min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-3 text-sm font-bold tracking-wide"><span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-500 text-lg">{schoolIcon ? <img src={schoolIcon} alt="" className="h-full w-full object-cover" /> : schoolName.charAt(0).toUpperCase()}</span><span className="truncate">{schoolName}</span></Link>
        <div className="flex items-center gap-2 sm:gap-3"><Link href="/about-us" className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white">About us</Link><Link href="/contact" className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white">Contact</Link><Link href="/login" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-50">Sign in</Link></div>
      </nav>
      <section className="relative mx-auto grid max-w-7xl gap-12 overflow-hidden px-6 pb-20 pt-16 sm:px-10 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:pb-28 lg:pt-24">{coverImage && <img src={coverImage} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-20" />}<div className="absolute inset-0 bg-slate-950/60" />
        <div className="relative z-10"><p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">Welcome to {schoolName}</p><h1 className="mt-6 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">{schoolName}, in one clear place.</h1><p className="mt-7 max-w-xl text-lg leading-8 text-slate-400">{description}</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/login" className="rounded-xl bg-blue-500 px-6 py-3.5 text-center font-semibold text-white hover:bg-blue-400">Open your workspace</Link><Link href="/about-us" className="rounded-xl border border-white/15 px-6 py-3.5 text-center font-semibold text-slate-200 hover:bg-white/5">Discover our school</Link></div></div>
        <div className="book-scene" aria-hidden="true"><div className="scene-orbit scene-orbit-one" /><div className="scene-orbit scene-orbit-two" /><div className="book book-one"><span /></div><div className="book book-two"><span /></div><div className="book book-three"><span /></div><div className="scene-pencil"><i /><b /></div><div className="scene-floor" /></div>
      </section>
      <section className="border-t border-white/10 bg-slate-900/70"><div className="mx-auto max-w-7xl px-6 py-12 sm:px-10"><div className="grid gap-4 sm:grid-cols-3"><Link href="/login" className="landing-feature"><span className="landing-feature-number">01</span><p className="text-sm font-semibold text-white">For administrators</p><p className="mt-2 text-sm leading-6 text-slate-400">See the whole school, make decisions faster, and keep records organized.</p><span className="mt-5 block text-xs font-semibold text-blue-300">Open workspace →</span></Link><Link href="/login" className="landing-feature"><span className="landing-feature-number">02</span><p className="text-sm font-semibold text-white">For teachers</p><p className="mt-2 text-sm leading-6 text-slate-400">Spend less time on paperwork and more time with your classes.</p><span className="mt-5 block text-xs font-semibold text-emerald-300">Open workspace →</span></Link><Link href="/login" className="landing-feature"><span className="landing-feature-number">03</span><p className="text-sm font-semibold text-white">For students</p><p className="mt-2 text-sm leading-6 text-slate-400">Keep attendance, homework, results, notices, and fees close at hand.</p><span className="mt-5 block text-xs font-semibold text-amber-300">Open workspace →</span></Link></div></div></section>
    </main>
  );
}
