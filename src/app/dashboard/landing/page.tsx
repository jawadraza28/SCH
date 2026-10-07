"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import LandingImageUpload from "@/components/LandingImageUpload";
import { EMPTY_LANDING, type GalleryImage, type LandingContent, type NewsPost, type TopStudent, type WhyUsItem } from "@/lib/landing";

/**
 * Landing-page editor for the admin.
 *
 * Everything the public home page shows beyond the school's name and contact
 * details is edited here and stored on the school document (images live on
 * Cloudinary). The whole content is held in one piece of state and saved in a
 * single PATCH, so what the admin removes is genuinely gone from the page.
 */

/** A fresh, empty row ready for the admin to fill in. */
const blankStudent = (): TopStudent => ({ id: "", name: "", className: "", section: "", achievement: "", year: "", photo: "", photoPublicId: "" });
const blankNews = (): NewsPost => ({ id: "", title: "", description: "", image: "", imagePublicId: "", published: true, publishedAt: new Date().toISOString() });
const blankGallery = (): GalleryImage => ({ id: "", image: "", imagePublicId: "", caption: "" });
const blankWhyUs = (index: number): WhyUsItem => ({ id: "", number: String(index + 1).padStart(2, "0"), title: "", description: "", tone: "blue" });

/** A labelled single-line text input. */
function Field({ label, value, onChange, placeholder, className = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

/** A labelled multi-line text area. */
function Area({ label, value, onChange, placeholder, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

/** A section wrapper with a heading and an optional action on the right. */
function Panel({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export default function LandingEditorPage() {
  const router = useRouter();
  const [content, setContent] = useState<LandingContent>(EMPTY_LANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/school-settings/landing", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (result.landing) setContent(result.landing);
        else setError(result.error ?? "Unable to load the landing page content");
      })
      .catch(() => setError("Unable to load the landing page content"))
      .finally(() => setLoading(false));
  }, []);

  function patch(part: Partial<LandingContent>) {
    setMessage("");
    setContent((current) => ({ ...current, ...part }));
  }
  const setStudent = (index: number, part: Partial<TopStudent>) => patch({ topStudents: content.topStudents.map((item, i) => (i === index ? { ...item, ...part } : item)) });
  const setNews = (index: number, part: Partial<NewsPost>) => patch({ newsPosts: content.newsPosts.map((item, i) => (i === index ? { ...item, ...part } : item)) });
  const setGallery = (index: number, part: Partial<GalleryImage>) => patch({ gallery: content.gallery.map((item, i) => (i === index ? { ...item, ...part } : item)) });
  const setWhyUs = (index: number, part: Partial<WhyUsItem>) => patch({ whyUs: content.whyUs.map((item, i) => (i === index ? { ...item, ...part } : item)) });

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/school-settings/landing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(content) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to save the landing page content");
      } else {
        setContent(result.landing);
        setMessage("Landing page saved. Open the public page to see it live.");
        router.refresh();
      }
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="app-page bg-slate-100 p-6 text-slate-900">Loading landing page content…</main>;
  }
  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-4xl">
        <BackLink />
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Landing page</h1>
            <p className="mt-2 max-w-2xl text-slate-500">Edit everything visitors see on your public home page. Images are stored on Cloudinary.</p>
          </div>
          <Link href="/" target="_blank" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Preview public page ↗
          </Link>
        </div>

        <div className="mt-6 space-y-6">
          <Panel title="Hero banner" description="The first thing visitors see: a cover photo and a short tagline under the school name.">
            <LandingImageUpload kind="cover" label="Cover photo" frameClass="h-40 w-full sm:w-56" value={content.coverImage} onChange={(url, publicId) => patch({ coverImage: url, coverImagePublicId: publicId })} hint="A wide landscape photo looks best. It sits behind the school name." />
            <Field label="Tagline" value={content.tagline} onChange={(value) => patch({ tagline: value })} placeholder="A clearer school day for every learner." />
          </Panel>

          <Panel title="Mission & vision" description="Two short statements about why the school exists and where it is headed.">
            <Area label="Our mission" value={content.mission} onChange={(value) => patch({ mission: value })} placeholder="To give every learner a strong, supportive start…" />
            <Area label="Our vision" value={content.vision} onChange={(value) => patch({ vision: value })} placeholder="To be the school families trust most…" />
          </Panel>

          <Panel
            title="Why families choose us"
            description="These cards appear in the Why us section on the public landing page. Keep each one short and specific."
            action={<button type="button" onClick={() => patch({ whyUs: [...content.whyUs, blankWhyUs(content.whyUs.length)] })} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">+ Add card</button>}
          >
            {content.whyUs.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">No Why us cards yet. Add the benefits your school is known for.</p> : (
              <div className="space-y-4">
                {content.whyUs.map((item, index) => (
                  <div key={item.id || index} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-700">Card {index + 1}</p><button type="button" onClick={() => patch({ whyUs: content.whyUs.filter((_, i) => i !== index) })} className="text-xs font-semibold text-rose-600 hover:underline">Remove</button></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <Field label="Number" value={item.number} onChange={(value) => setWhyUs(index, { number: value })} placeholder="01" />
                      <Field label="Title" value={item.title} onChange={(value) => setWhyUs(index, { title: value })} placeholder="Supportive learning" className="sm:col-span-2" />
                      <Area label="Description" value={item.description} onChange={(value) => setWhyUs(index, { description: value })} placeholder="Describe this school's strength…" rows={3} />
                      <label className="text-sm font-medium">Accent
                        <select value={item.tone} onChange={(event) => setWhyUs(index, { tone: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="blue">Blue</option><option value="emerald">Emerald</option><option value="violet">Violet</option><option value="amber">Amber</option></select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Principal's message" description="A short welcome from the head of the school, shown with an optional portrait.">
            <div className="grid gap-4 sm:grid-cols-[14rem_1fr] sm:items-start">
              <LandingImageUpload kind="principal" label="Portrait" frameClass="h-40 w-40 rounded-2xl" value={content.principalPhoto} onChange={(url, publicId) => patch({ principalPhoto: url, principalPhotoPublicId: publicId })} />
              <div className="space-y-4">
                <Field label="Principal's name" value={content.principalName} onChange={(value) => patch({ principalName: value })} placeholder="e.g. Mrs. Ayesha Khan" />
                <Area label="Message" value={content.principalMessage} onChange={(value) => patch({ principalMessage: value })} placeholder="Welcome to our school. We believe…" />
              </div>
            </div>
          </Panel>

          <Panel
            title="Top students"
            description="Celebrate outstanding learners — they appear in an achievers band on the public page."
            action={
              <button type="button" onClick={() => patch({ topStudents: [...content.topStudents, blankStudent()] })} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                + Add student
              </button>
            }
          >
            {content.topStudents.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">No students yet. Add your first achiever.</p>
            ) : (
              <div className="space-y-4">
                {content.topStudents.map((student, index) => (
                  <div key={student.id || index} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-700">Student {index + 1}</p>
                      <button type="button" onClick={() => patch({ topStudents: content.topStudents.filter((_, i) => i !== index) })} className="text-xs font-semibold text-rose-600 hover:underline">
                        Remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
                      <LandingImageUpload kind="topStudent" label="Photo" frameClass="h-32 w-32 rounded-2xl" value={student.photo} onChange={(url, publicId) => setStudent(index, { photo: url, photoPublicId: publicId })} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Name" value={student.name} onChange={(value) => setStudent(index, { name: value })} placeholder="e.g. Hamza Ali" />
                        <Field label="Class" value={student.className} onChange={(value) => setStudent(index, { className: value })} placeholder="e.g. 10" />
                        <Field label="Section" value={student.section} onChange={(value) => setStudent(index, { section: value })} placeholder="e.g. A" />
                        <Field label="Year" value={student.year} onChange={(value) => setStudent(index, { year: value })} placeholder="e.g. 2025" />
                        <Field label="Achievement" value={student.achievement} onChange={(value) => setStudent(index, { achievement: value })} placeholder="e.g. Top of the board exams" className="sm:col-span-2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel
            title="News & announcements"
            description="Share updates on the public page. Unpublished posts stay hidden from visitors."
            action={
              <button type="button" onClick={() => patch({ newsPosts: [blankNews(), ...content.newsPosts] })} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                + Add news
              </button>
            }
          >
            {content.newsPosts.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">No news posts yet. Add your first update.</p>
            ) : (
              <div className="space-y-4">
                {content.newsPosts.map((post, index) => (
                  <div key={post.id || index} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input type="checkbox" checked={post.published} onChange={(event) => setNews(index, { published: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                        Published
                      </label>
                      <button type="button" onClick={() => patch({ newsPosts: content.newsPosts.filter((_, i) => i !== index) })} className="text-xs font-semibold text-rose-600 hover:underline">
                        Remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
                      <LandingImageUpload kind="news" label="Image" frameClass="h-28 w-40 rounded-2xl" value={post.image} onChange={(url, publicId) => setNews(index, { image: url, imagePublicId: publicId })} />
                      <div className="space-y-3">
                        <Field label="Headline" value={post.title} onChange={(value) => setNews(index, { title: value })} placeholder="e.g. Annual sports day" />
                        <Area label="Details" rows={3} value={post.description} onChange={(value) => setNews(index, { description: value })} placeholder="A short paragraph about the update…" />
                        <label className="block text-sm font-medium text-slate-700">
                          Date
                          <input
                            type="date"
                            value={post.publishedAt ? post.publishedAt.slice(0, 10) : ""}
                            onChange={(event) => setNews(index, { publishedAt: event.target.value ? new Date(event.target.value).toISOString() : new Date().toISOString() })}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-48"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel
            title="Gallery"
            description="A grid of campus photos shown near the bottom of the public page."
            action={
              <button type="button" onClick={() => patch({ gallery: [...content.gallery, blankGallery()] })} className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                + Add photo
              </button>
            }
          >
            {content.gallery.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">No photos yet. Add your first campus picture.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {content.gallery.map((item, index) => (
                  <div key={item.id || index} className="rounded-xl border border-slate-200 p-4">
                    <LandingImageUpload kind="gallery" label={`Photo ${index + 1}`} frameClass="h-36 w-full rounded-xl" value={item.image} onChange={(url, publicId) => setGallery(index, { image: url, imagePublicId: publicId })} />
                    <div className="mt-3">
                      <Field label="Caption" value={item.caption} onChange={(value) => setGallery(index, { caption: value })} placeholder="Optional caption" />
                    </div>
                    <button type="button" onClick={() => patch({ gallery: content.gallery.filter((_, i) => i !== index) })} className="mt-3 text-xs font-semibold text-rose-600 hover:underline">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Brand logo" description="Shown in the site header and on the sign-in screen.">
            <LandingImageUpload kind="logo" label="Logo" frameClass="h-20 w-20 rounded-xl" value={content.logo} onChange={(url, publicId) => patch({ logo: url, logoPublicId: publicId })} hint="A square PNG with a transparent background works best." />
          </Panel>
        </div>

        <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
            {saving ? "Saving…" : "Save landing page"}
          </button>
          <Link href="/" target="_blank" className="text-sm font-semibold text-slate-500 hover:text-slate-800">
            Preview ↗
          </Link>
          {message ? <span className="text-sm font-medium text-emerald-600">{message}</span> : null}
          {error ? <span className="text-sm font-medium text-rose-600">{error}</span> : null}
        </div>
      </div>
    </main>
  );
}