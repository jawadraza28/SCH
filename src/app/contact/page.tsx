import Link from "next/link";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  let school: { schoolName?: string; schoolAddress?: string; schoolPhone?: string; schoolEmail?: string } | null = null;
  try {
    await connectToDatabase();
    school = await SchoolConfiguration.findOne().select("schoolName schoolAddress schoolPhone schoolEmail").lean();
  } catch {
    // Keep the contact page available before setup is complete.
  }
  const name = school?.schoolName || "Your School";
  const address = school?.schoolAddress || "School address will appear after setup.";
  const mapUrl = school?.schoolAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(school.schoolAddress)}` : "";
  return <main className="min-h-screen bg-slate-950 text-slate-100"><nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-10"><Link href="/" className="flex items-center gap-3 text-sm font-bold tracking-wide"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500 text-lg">{name.charAt(0).toUpperCase()}</span>{name}</Link><div className="flex gap-2"><Link href="/" className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:text-white">Home</Link><Link href="/login" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900">Sign in</Link></div></nav><section className="mx-auto max-w-6xl px-6 pb-20 pt-12 sm:px-10 sm:pt-20"><p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">Get in touch</p><h1 className="mt-4 text-4xl font-bold sm:text-6xl">Contact {name}</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">Reach the school using the contact details below or open the address directly in maps.</p><div className="mt-12 grid gap-5 md:grid-cols-3"><a href={school?.schoolEmail ? `mailto:${school.schoolEmail}` : undefined} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 transition hover:bg-white/[0.1]"><span className="text-2xl">✉</span><h2 className="mt-4 font-semibold">Email</h2><p className="mt-2 break-all text-sm text-slate-400">{school?.schoolEmail || "Email not provided"}</p></a><a href={school?.schoolPhone ? `tel:${school.schoolPhone}` : undefined} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 transition hover:bg-white/[0.1]"><span className="text-2xl">☎</span><h2 className="mt-4 font-semibold">Phone</h2><p className="mt-2 text-sm text-slate-400">{school?.schoolPhone || "Phone not provided"}</p></a><a href={mapUrl || undefined} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 transition hover:bg-white/[0.1]"><span className="text-2xl">⌖</span><h2 className="mt-4 font-semibold">Address and map</h2><p className="mt-2 text-sm text-slate-400">{address}</p>{mapUrl && <span className="mt-4 block text-sm font-semibold text-blue-300">Open in Google Maps →</span>}</a></div></section></main>;
}
