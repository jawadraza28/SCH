import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { signedR2Url } from "@/lib/object-storage";
import LandingNav from "@/components/LandingNav";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  let school: { schoolName?: string; schoolAddress?: string; schoolPhone?: string; schoolEmail?: string; schoolIcon?: string } | null = null;
  try {
    await connectToDatabase();
    school = await SchoolConfiguration.findOne().sort({ updatedAt: -1, createdAt: -1 }).select("schoolName schoolAddress schoolPhone schoolEmail schoolIcon").lean();
  } catch {
    // Keep the contact page available before setup is complete.
  }
  const name = school?.schoolName || "Your School";
  let schoolIcon = "";
  if (school?.schoolIcon?.startsWith("r2://")) {
    try { schoolIcon = await signedR2Url(school.schoolIcon); } catch (error) { console.error("Contact page icon URL error:", error); }
  }
  const address = school?.schoolAddress || "School address will appear after setup.";
  const mapUrl = school?.schoolAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(school.schoolAddress)}` : "";
  return <main className="min-h-screen bg-slate-950 text-slate-100"><LandingNav schoolName={name} schoolIcon={schoolIcon} /><section className="public-page mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-10 sm:pt-20"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400 sm:text-sm sm:tracking-[0.22em]">Get in touch</p><h1 className="mt-4 text-4xl font-bold sm:text-6xl">Contact {name}</h1><p className="mt-5 text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">Reach the school using the contact details below or open the address directly in maps.</p></div><div className="mt-10 grid gap-4 sm:mt-12 md:grid-cols-3 md:gap-5"><a href={school?.schoolEmail ? `mailto:${school.schoolEmail}` : undefined} className="public-card min-h-44 transition hover:bg-white/[0.1]"><span className="text-2xl">✉</span><h2 className="mt-4 font-semibold">Email</h2><p className="mt-2 break-all text-sm text-slate-400">{school?.schoolEmail || "Email not provided"}</p>{school?.schoolEmail && <span className="mt-4 block text-sm font-semibold text-blue-300">Send an email →</span>}</a><a href={school?.schoolPhone ? `tel:${school.schoolPhone}` : undefined} className="public-card min-h-44 transition hover:bg-white/[0.1]"><span className="text-2xl">☎</span><h2 className="mt-4 font-semibold">Phone</h2><p className="mt-2 text-sm text-slate-400">{school?.schoolPhone || "Phone not provided"}</p>{school?.schoolPhone && <span className="mt-4 block text-sm font-semibold text-blue-300">Call the school →</span>}</a><a href={mapUrl || undefined} target="_blank" rel="noreferrer" className="public-card min-h-44 transition hover:bg-white/[0.1]"><span className="text-2xl">⌖</span><h2 className="mt-4 font-semibold">Address and map</h2><p className="mt-2 text-sm text-slate-400">{address}</p>{mapUrl && <span className="mt-4 block text-sm font-semibold text-blue-300">Open in Google Maps →</span>}</a></div></section></main>;
}
