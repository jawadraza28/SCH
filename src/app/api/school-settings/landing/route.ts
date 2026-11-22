import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { deleteCloudinaryPhoto } from "@/lib/cloudinary";
import { readLanding, type LandingContent } from "@/lib/landing";

/**
 * Landing-page content for the signed-in admin's school.
 *
 * GET   → the normalised content the editor renders.
 * PATCH → replaces every landing field with a sanitised copy of the request.
 *
 * The whole content is sent in one JSON payload (the editor already holds the
 * complete list), so a PATCH is a full replace: whatever the admin removed is
 * simply absent. Any Cloudinary asset that was in the previous version but is
 * gone from the new one is deleted afterwards (best effort — a cleanup failure
 * must never fail the save).
 */

const MAX_STUDENTS = 24;
const MAX_NEWS = 24;
const MAX_GALLERY = 40;
const MAX_SHORT = 160;
const MAX_MEDIUM = 600;
const MAX_LONG = 4000;
const MAX_WHY_US = 8;

/** Trims a value to a string, capped at `max` characters. */
function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function preserved(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A capped array, or an empty one when the field is missing/not a list. */
function asList(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

/** Coerces a date-ish value to a Date, defaulting to now. */
function toDate(value: unknown): Date {
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  await connectToDatabase();
  const school = await SchoolConfiguration.findById(session.user.school).lean();
  if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
  return NextResponse.json({ landing: readLanding(school) });
}

export async function PATCH(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  try {
    await connectToDatabase();
    const existing = await SchoolConfiguration.findById(session.user.school).lean();
    if (!existing) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    const body = (await request.json().catch(() => null)) as Partial<LandingContent> | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "A JSON request body is required" }, { status: 400 });

    const fields: { label: string; value: unknown; max: number }[] = [
      { label: "Tagline", value: body.tagline, max: MAX_SHORT },
      { label: "Mission", value: body.mission, max: MAX_LONG },
      { label: "Vision", value: body.vision, max: MAX_LONG },
      { label: "Principal name", value: body.principalName, max: MAX_SHORT },
      { label: "Principal message", value: body.principalMessage, max: MAX_LONG },
      { label: "Principal photo URL", value: body.principalPhoto, max: MAX_MEDIUM },
      { label: "Principal photo ID", value: body.principalPhotoPublicId, max: MAX_MEDIUM },
      { label: "Cover image URL", value: body.coverImage, max: MAX_MEDIUM },
      { label: "Cover image ID", value: body.coverImagePublicId, max: MAX_MEDIUM },
      { label: "Logo URL", value: body.logo, max: MAX_MEDIUM },
      { label: "Logo ID", value: body.logoPublicId, max: MAX_MEDIUM },
      ...asList(body.topStudents, MAX_STUDENTS).flatMap((entry, index) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return [
          { label: `Student ${index + 1} name`, value: item.name, max: MAX_SHORT },
          { label: `Student ${index + 1} class`, value: item.className, max: MAX_SHORT },
          { label: `Student ${index + 1} section`, value: item.section, max: MAX_SHORT },
          { label: `Student ${index + 1} achievement`, value: item.achievement, max: MAX_MEDIUM },
          { label: `Student ${index + 1} year`, value: item.year, max: MAX_SHORT },
          { label: `Student ${index + 1} photo URL`, value: item.photo, max: MAX_MEDIUM },
          { label: `Student ${index + 1} photo ID`, value: item.photoPublicId, max: MAX_MEDIUM },
        ];
      }),
      ...asList(body.newsPosts, MAX_NEWS).flatMap((entry, index) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return [
          { label: `News ${index + 1} headline`, value: item.title, max: MAX_SHORT },
          { label: `News ${index + 1} details`, value: item.description, max: MAX_LONG },
          { label: `News ${index + 1} image URL`, value: item.image, max: MAX_MEDIUM },
          { label: `News ${index + 1} image ID`, value: item.imagePublicId, max: MAX_MEDIUM },
        ];
      }),
      ...asList(body.gallery, MAX_GALLERY).flatMap((entry, index) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return [
          { label: `Gallery ${index + 1} image URL`, value: item.image, max: MAX_MEDIUM },
          { label: `Gallery ${index + 1} image ID`, value: item.imagePublicId, max: MAX_MEDIUM },
          { label: `Gallery ${index + 1} caption`, value: item.caption, max: MAX_SHORT },
        ];
      }),
      ...asList(body.whyUs, MAX_WHY_US).flatMap((entry, index) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return [
          { label: `Why us ${index + 1} number`, value: item.number, max: 8 },
          { label: `Why us ${index + 1} title`, value: item.title, max: MAX_SHORT },
          { label: `Why us ${index + 1} description`, value: item.description, max: MAX_MEDIUM },
        ];
      }),
    ];
    const tooLong = fields.find((field) => typeof field.value === "string" && field.value.length > field.max);
    if (tooLong) {
      return NextResponse.json({ error: `${tooLong.label} must be ${tooLong.max} characters or fewer` }, { status: 400 });
    }

    const topStudents = asList(body.topStudents, MAX_STUDENTS).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        name: clean(item.name, MAX_SHORT),
        className: clean(item.className, MAX_SHORT),
        section: clean(item.section, MAX_SHORT),
        achievement: preserved(item.achievement),
        year: clean(item.year, MAX_SHORT),
        photo: clean(item.photo, MAX_MEDIUM),
        photoPublicId: clean(item.photoPublicId, MAX_MEDIUM),
      };
    });

    const newsPosts = asList(body.newsPosts, MAX_NEWS).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        title: clean(item.title, MAX_SHORT),
        description: preserved(item.description),
        image: clean(item.image, MAX_MEDIUM),
        imagePublicId: clean(item.imagePublicId, MAX_MEDIUM),
        published: item.published === undefined ? true : Boolean(item.published),
        publishedAt: toDate(item.publishedAt),
      };
    });

    const gallery = asList(body.gallery, MAX_GALLERY).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        image: clean(item.image, MAX_MEDIUM),
        imagePublicId: clean(item.imagePublicId, MAX_MEDIUM),
        caption: preserved(item.caption),
      };
    });
    const whyUs = asList(body.whyUs, MAX_WHY_US).map((entry, index) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        number: clean(item.number, 8) || String(index + 1).padStart(2, "0"),
        title: clean(item.title, MAX_SHORT),
        description: preserved(item.description),
        tone: ["blue", "emerald", "violet", "amber"].includes(String(item.tone)) ? String(item.tone) : "blue",
      };
    });

    const update = {
      tagline: clean(body.tagline, MAX_SHORT),
      mission: preserved(body.mission),
      vision: preserved(body.vision),
      principalName: clean(body.principalName, MAX_SHORT),
      principalMessage: preserved(body.principalMessage),
      principalPhoto: clean(body.principalPhoto, MAX_MEDIUM),
      principalPhotoPublicId: clean(body.principalPhotoPublicId, MAX_MEDIUM),
      coverImage: clean(body.coverImage, MAX_MEDIUM),
      coverImagePublicId: clean(body.coverImagePublicId, MAX_MEDIUM),
      logo: clean(body.logo, MAX_MEDIUM),
      logoPublicId: clean(body.logoPublicId, MAX_MEDIUM),
      topStudents,
      newsPosts,
      gallery,
      whyUs,
    };

    const previous = readLanding(existing);
    const updated = await SchoolConfiguration.findByIdAndUpdate(session.user.school, { $set: update }, { new: true }).lean();
    const landing = readLanding(updated);

    // Delete Cloudinary assets the save dropped, so the account does not fill
    // with orphans. Failures are logged only.
    const before = collectPublicIds(previous);
    const after = new Set(collectPublicIds(landing));
    await Promise.all(
      before.filter((id) => id && !after.has(id)).map((id) => deleteCloudinaryPhoto(id).catch((error) => console.warn("Landing asset cleanup failed:", error))),
    );

    return NextResponse.json({ success: true, landing });
  } catch (error) {
    console.error("Landing content update error:", error);
    return NextResponse.json({ error: "Unable to update the landing page content" }, { status: 500 });
  }
}

/** Every Cloudinary public id referenced by a piece of landing content. */
function collectPublicIds(content: LandingContent): string[] {
  return [
    content.coverImagePublicId,
    content.logoPublicId,
    content.principalPhotoPublicId,
    ...content.topStudents.map((student) => student.photoPublicId),
    ...content.newsPosts.map((post) => post.imagePublicId),
    ...content.gallery.map((item) => item.imagePublicId),
  ].filter(Boolean);
}