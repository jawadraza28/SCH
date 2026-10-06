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

/** Trims a value to a string, capped at `max` characters. */
function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

    const topStudents = asList(body.topStudents, MAX_STUDENTS).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        name: clean(item.name, MAX_SHORT),
        className: clean(item.className, MAX_SHORT),
        section: clean(item.section, MAX_SHORT),
        achievement: clean(item.achievement, MAX_MEDIUM),
        year: clean(item.year, MAX_SHORT),
        photo: clean(item.photo, MAX_MEDIUM),
        photoPublicId: clean(item.photoPublicId, MAX_MEDIUM),
      };
    });

    const newsPosts = asList(body.newsPosts, MAX_NEWS).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        title: clean(item.title, MAX_SHORT),
        description: clean(item.description, MAX_LONG),
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
        caption: clean(item.caption, MAX_SHORT),
      };
    });

    const update = {
      tagline: clean(body.tagline, MAX_SHORT),
      mission: clean(body.mission, MAX_LONG),
      vision: clean(body.vision, MAX_LONG),
      principalName: clean(body.principalName, MAX_SHORT),
      principalMessage: clean(body.principalMessage, MAX_LONG),
      principalPhoto: clean(body.principalPhoto, MAX_MEDIUM),
      principalPhotoPublicId: clean(body.principalPhotoPublicId, MAX_MEDIUM),
      coverImage: clean(body.coverImage, MAX_MEDIUM),
      coverImagePublicId: clean(body.coverImagePublicId, MAX_MEDIUM),
      logo: clean(body.logo, MAX_MEDIUM),
      logoPublicId: clean(body.logoPublicId, MAX_MEDIUM),
      topStudents,
      newsPosts,
      gallery,
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