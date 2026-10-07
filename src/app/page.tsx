import Link from "next/link";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, SchoolConfiguration, Student, Teacher } from "@/Models";
import LandingNav from "@/components/LandingNav";
import { formatCount } from "@/components/charts/palette";
import { publishedNews, readLanding, visibleGallery, visibleTopStudents } from "@/lib/landing";

export const dynamic = "force-dynamic";

/** A short, human date for news cards. */
function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The public home page. Everything below the school's name is content the
 * admin edits in the dashboard (School settings → Landing page) and images are
 * served from Cloudinary. Each band renders only when it actually has content,
 * so a school that has filled in nothing still gets a clean, complete page.
 */
export default async function Home() {
  let school: Record<string, unknown> | null = null;
  let studentCount = 0;
  let teacherCount = 0;
  let classCount = 0;
  try {
    await connectToDatabase();
    school = await SchoolConfiguration.findOne()
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("schoolName schoolDescription schoolAddress schoolPhone schoolEmail socialMedia academicYear tagline mission vision principalName principalMessage principalPhoto coverImage logo topStudents newsPosts gallery whyUs")
      .lean();
    const [students, teachers, classes] = await Promise.all([
      Student.countDocuments({ accountStatus: { $in: ["active", "pending"] } }),
      Teacher.countDocuments(),
      ClassSection.countDocuments({ isActive: true }),
    ]);
    studentCount = students;
    teacherCount = teachers;
    classCount = classes;
  } catch {
    // The public page remains useful while first-time setup is being prepared.
  }

  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const schoolName = text(school?.schoolName) || "Your School";
  const description = text(school?.schoolDescription) || "One clear place for attendance, learning, communication, and progress.";
  const content = readLanding(school);
  const coverImage = content.coverImage || "/landingcover.png";
  const logo = content.logo || "/logo.png";
  const news = publishedNews(content);
  const achievers = visibleTopStudents(content);
  const gallery = visibleGallery(content);
  const heroLead = content.tagline || description;
  const social = (school?.socialMedia ?? {}) as Record<string, unknown>;
  const socialLinks = [
    { label: "Facebook", value: text(social.facebook), icon: "f" },
    { label: "Instagram", value: text(social.instagram), icon: "◎" },
    { label: "YouTube", value: text(social.youtube), icon: "▶" },
    { label: "WhatsApp", value: text(social.whatsapp), icon: "◔" },
    { label: "LinkedIn", value: text(social.linkedin), icon: "in" },
  ].filter((item) => item.value);

  const stats = [
    { label: "Students", value: studentCount },
    { label: "Teachers", value: teacherCount },
    { label: "Classes", value: classCount },
  ].filter((stat) => stat.value > 0);

  return (
    <main className="landing-page min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <section className="landing-hero relative w-full overflow-hidden px-4 pb-14 sm:px-10 sm:pb-20 lg:pb-28">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverImage} alt="" aria-hidden className="landing-cover opacity-75" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgb(59_130_246_/_0.28),transparent_35%),linear-gradient(120deg,rgb(2_6_23_/_0.92),rgb(2_6_23_/_0.42),rgb(2_6_23_/_0.82))]" />
        <div aria-hidden className="landing-cover-fade" />
        <LandingNav schoolName={schoolName} logo={logo} />
        <div className="relative z-10 mx-auto max-w-7xl pt-10 sm:pt-16 lg:pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400 sm:text-sm sm:tracking-[0.22em]">Welcome to</p>
          <h1 className="mt-4 max-w-3xl text-[clamp(1.75rem,8vw,3.75rem)] font-bold leading-[1.1] tracking-tight sm:mt-6">{schoolName}</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-400 sm:mt-7 sm:text-lg sm:leading-8">{heroLead}</p>
          <div className="mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row">
            <Link href="/login" className="landing-cta-primary rounded-2xl px-6 py-3.5 text-center font-semibold text-white">Open your workspace <span aria-hidden>→</span></Link>
            <Link href="/about-us" className="landing-cta-secondary rounded-2xl px-6 py-3.5 text-center font-semibold text-slate-200">Discover our school</Link>
          </div>
          {stats.length ? (
            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 sm:mt-12">
              {stats.map((stat) => (
                <div key={stat.label} className="landing-stat rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center backdrop-blur sm:px-5">
                  <p className="text-xl font-bold tabular-nums sm:text-2xl">{formatCount(stat.value)}</p>
                  <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <section id="about" className="border-t border-white/10 bg-slate-900/70">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-10 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="landing-eyebrow text-blue-300">A better school day</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">A welcoming place to learn, grow, and belong.</h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400">{description}</p>
            </div>
            <div id="highlights" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {(content.whyUs.length ? content.whyUs : [
                { id: "1", number: "01", title: "Clear communication", description: "Families stay connected to school life.", tone: "blue" },
                { id: "2", number: "02", title: "Focused learning", description: "Teachers help every learner make progress.", tone: "emerald" },
                { id: "3", number: "03", title: "Confident futures", description: "Skills and character grow together.", tone: "violet" },
              ]).map((item) => (
                <article key={item.id || item.number} className={`landing-feature landing-feature-${item.tone} landing-reveal`}>
                  <span className="landing-feature-number">{item.number}</span>
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      {(content.mission || content.vision) ? (
        <section className="border-t border-white/10 bg-slate-900/70">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-10 sm:py-16">
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
              {content.mission ? (
                <article className="landing-panel border-blue-300/20">
                  <p className="landing-eyebrow text-blue-300">Our mission</p>
                  <p className="mt-3 text-base leading-7 text-slate-300">{content.mission}</p>
                </article>
              ) : null}
              {content.vision ? (
                <article className="landing-panel border-emerald-300/20">
                  <p className="landing-eyebrow text-emerald-300">Our vision</p>
                  <p className="mt-3 text-base leading-7 text-slate-300">{content.vision}</p>
                </article>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {(content.principalName || content.principalMessage || content.principalPhoto) ? (
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-10 sm:py-16">
            <div className="grid gap-6 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-10">
              {content.principalPhoto ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={content.principalPhoto} alt={content.principalName || "Principal"} className="h-56 w-full max-w-xs rounded-3xl object-cover sm:h-52 sm:w-52" />
                </>
              ) : null}
              <div>
                <p className="landing-eyebrow text-blue-300">From the principal</p>
                {content.principalMessage ? <p className="mt-4 text-lg italic leading-8 text-slate-300">“{content.principalMessage}”</p> : null}
                {content.principalName ? <p className="mt-5 font-semibold text-white">{content.principalName}</p> : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {achievers.length ? (
        <section className="border-t border-white/10 bg-slate-900/70">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-10 sm:py-16">
            <div className="max-w-2xl">
              <p className="landing-eyebrow text-amber-300">Our achievers</p>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Top students</h2>
              <p className="mt-3 text-slate-400">Learners who make us proud through their effort and results.</p>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {achievers.map((student, index) => (
                <article key={student.id || index} className="landing-card">
                  <div className="flex items-center gap-4">
                    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/10 text-lg font-bold">
                      {student.photo ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={student.photo} alt={student.name} className="h-full w-full object-cover" />
                        </>
                      ) : (
                        student.name.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{student.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {[student.className ? `Class ${student.className}` : "", student.section ? `Section ${student.section}` : "", student.year].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  {student.achievement ? <p className="mt-4 text-sm leading-6 text-slate-300">{student.achievement}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {news.length ? (
        <section id="news" className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-10 sm:py-16">
            <div className="max-w-2xl">
              <p className="landing-eyebrow text-blue-300">Latest updates</p>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">News &amp; announcements</h2>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {news.map((post, index) => (
                <article key={post.id || index} className="landing-card overflow-hidden p-0">
                  {post.image ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.image} alt={post.title || "News"} className="h-44 w-full object-cover" />
                    </>
                  ) : null}
                  <div className="p-5">
                    {post.publishedAt ? <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">{formatDate(post.publishedAt)}</p> : null}
                    {post.title ? <h3 className="mt-2 font-semibold text-white">{post.title}</h3> : null}
                    {post.description ? <p className="mt-2 text-sm leading-6 text-slate-400">{post.description}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {gallery.length ? (
        <section id="gallery" className="border-t border-white/10 bg-slate-900/70">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-10 sm:py-16">
            <div className="max-w-2xl">
              <p className="landing-eyebrow text-emerald-300">Campus life</p>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Gallery</h2>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {gallery.map((item, index) => (
                <figure key={item.id || index} className="overflow-hidden rounded-2xl border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.caption || "Campus"} className="h-40 w-full object-cover transition duration-300 hover:scale-105 sm:h-44" />
                  {item.caption ? <figcaption className="bg-white/5 px-3 py-2 text-xs text-slate-300">{item.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

     

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-10 sm:py-16">
          <div className="landing-panel flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Ready to see it in action?</h2>
              <p className="mt-2 max-w-xl text-slate-400">Open the workspace, or reach the school office to arrange a visit.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="rounded-xl bg-blue-500 px-6 py-3 text-center font-semibold text-white hover:bg-blue-400">Sign in</Link>
              <Link href="/contact" className="rounded-xl border border-white/15 px-6 py-3 text-center font-semibold text-slate-200 hover:bg-white/5">Contact us</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{schoolName} · A clearer school day.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/about-us" className="hover:text-white">About us</Link>
            <Link href="/contact" className="hover:text-white">Contact</Link>
            <Link href="/login" className="hover:text-white">Sign in</Link>
            {socialLinks.map((item) => <a key={item.label} href={item.value} target="_blank" rel="noreferrer" aria-label={item.label} className="landing-social" title={item.label}>{item.icon}</a>)}
          </div>
        </div>
      </footer>
    </main>
  );
}