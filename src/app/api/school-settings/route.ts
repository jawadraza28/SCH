import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { deleteFromR2, r2Configured, signedR2Url, uploadToR2 } from "@/lib/object-storage";

const imageFields = ["logo", "schoolIcon", "coverImage"] as const;

async function withSignedImages<T extends Record<string, unknown> | null>(school: T) {
  if (!school) return null;
  const result = { ...school };
  for (const field of imageFields) {
    const value = result[field];
    if (typeof value === "string" && value.startsWith("r2://")) result[field] = await signedR2Url(value);
  }
  return result;
}

async function uploadImage(file: FormDataEntryValue, key: string) {
  if (!(file instanceof File) || !file.size) return "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Only JPG, PNG, and WebP images are allowed");
  const original = Buffer.from(await file.arrayBuffer());
  const isCover = key === "coverImage";
  const compressed = await sharp(original).rotate().resize({ width: isCover ? 1600 : 800, height: isCover ? 700 : 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const objectName = `school/${key}-${Date.now()}.jpg`;
  await uploadToR2(objectName, compressed, "image/jpeg");
  return `r2://${process.env.R2_BUCKET_NAME}/${objectName}`;
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  await connectToDatabase();
  const school = await SchoolConfiguration.findById(session.user.school).lean();
  return NextResponse.json({ school: await withSignedImages(school) });
}

export async function PATCH(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findById(session.user.school);
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    const form = await request.formData();
    for (const field of ["schoolName", "schoolAddress", "schoolPhone", "schoolEmail", "schoolDescription", "schoolTimezone", "subscriptionPlan"]) {
      const value = form.get(field);
      if (typeof value === "string") school[field] = value.trim();
    }
    const monthlyFee = form.get("monthlyFee");
    if (typeof monthlyFee === "string" && monthlyFee.trim()) school.monthlyFee = Number(monthlyFee);
    if (!Number.isFinite(school.monthlyFee) || school.monthlyFee < 0) return NextResponse.json({ error: "Monthly fee must be a valid positive number" }, { status: 400 });
    const hasImage = imageFields.some((field) => form.get(field) instanceof File);
    if (hasImage && !r2Configured()) return NextResponse.json({ error: "Cloudflare R2 photo storage is not configured" }, { status: 500 });
    for (const field of imageFields) {
      if (form.get(`remove${field.charAt(0).toUpperCase()}${field.slice(1)}`) === "true") {
        const previous = school[field];
        school[field] = "";
        if (previous?.startsWith("r2://")) await deleteFromR2(previous).catch((error) => console.warn(`Previous school ${field} cleanup failed:`, error));
      }
      const uploaded = await uploadImage(form.get(field)!, field);
      if (uploaded) {
        const previous = school[field];
        school[field] = uploaded;
        if (previous?.startsWith("r2://")) await deleteFromR2(previous).catch((error) => console.warn(`Previous school ${field} cleanup failed:`, error));
      }
    }
    await school.save();
    return NextResponse.json({ success: true, school: await withSignedImages(school.toObject()) });
  } catch (error) {
    console.error("School settings update error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update school settings" }, { status: 500 });
  }
}
