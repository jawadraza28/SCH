import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";
import { cloudinaryConfigured, cloudinaryMissingVariables, deleteCloudinaryPhoto, uploadProfilePhoto } from "@/lib/cloudinary";

async function teacherSession() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "teacher") return null;
  await connectToDatabase();
  return { session, teacher: await Teacher.findOne({ cnic: session.user.cnic }) };
}

export async function POST(request: Request) {
  const access = await teacherSession();
  if (!access) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  try {
    const file = (await request.formData()).get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "A photo is required" }, { status: 400 });
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Only JPG, PNG, and WebP images are allowed" }, { status: 400 });
    const maxUploadMb = Math.max(1, Number(process.env.TEACHER_PHOTO_MAX_UPLOAD_MB ?? process.env.STUDENT_PHOTO_MAX_UPLOAD_MB ?? 5));
    if (file.size > maxUploadMb * 1024 * 1024) return NextResponse.json({ error: `Photo must be ${maxUploadMb} MB or smaller` }, { status: 400 });
    if (!cloudinaryConfigured()) {
      console.error("Teacher photo upload blocked: missing Cloudinary variables", cloudinaryMissingVariables());
      return NextResponse.json({ error: "Photo storage is not configured on the server. Add the Cloudinary environment variables in Vercel, then redeploy." }, { status: 503 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const uploaded = await uploadProfilePhoto(compressed, `school/teachers/${String(access.teacher._id)}`);
    const previousPublicId = access.teacher.profilePhotoPublicId;
    access.teacher.profilePhotoUrl = uploaded.secure_url;
    access.teacher.profilePhotoPublicId = uploaded.public_id;
    try {
      await access.teacher.save();
    } catch (error) {
      await deleteCloudinaryPhoto(uploaded.public_id).catch((cleanupError) => console.warn("Failed to clean up teacher photo after database failure:", cleanupError));
      throw error;
    }
    if (previousPublicId) await deleteCloudinaryPhoto(previousPublicId).catch((error) => console.warn("Previous teacher photo cleanup failed:", error));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Teacher photo upload error:", error);
    return NextResponse.json({ error: "Unable to upload teacher photo" }, { status: 500 });
  }
}

export async function GET() {
  const access = await teacherSession();
  if (!access) return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  try {
    if (!access.teacher.profilePhotoUrl) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    if (access.teacher.profilePhotoUrl.startsWith("http")) return NextResponse.redirect(access.teacher.profilePhotoUrl);
    return NextResponse.json({ error: "This photo uses an old storage provider. Re-upload it to Cloudinary." }, { status: 410 });
  } catch (error) {
    console.error("Teacher photo read error:", error);
    return NextResponse.json({ error: "Unable to load teacher photo" }, { status: 500 });
  }
}
