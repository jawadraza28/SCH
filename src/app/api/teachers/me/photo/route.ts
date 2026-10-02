import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";
import { deleteFromR2, r2Configured, signedR2Url, uploadToR2 } from "@/lib/object-storage";

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
    if (!r2Configured()) return NextResponse.json({ error: "Cloudflare R2 photo storage is not configured" }, { status: 500 });

    const original = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const objectName = `teachers/${String(access.teacher._id)}/profile-${Date.now()}.jpg`;
    await uploadToR2(objectName, compressed, "image/jpeg");
    const previousPhoto = access.teacher.profilePhotoUrl;
    access.teacher.profilePhotoUrl = `r2://${process.env.R2_BUCKET_NAME}/${objectName}`;
    await access.teacher.save();
    if (previousPhoto && previousPhoto.startsWith("r2://")) await deleteFromR2(previousPhoto).catch((error) => console.warn("Previous teacher photo cleanup failed:", error));
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
    if (access.teacher.profilePhotoUrl.startsWith("r2://")) return NextResponse.redirect(await signedR2Url(access.teacher.profilePhotoUrl));
    return NextResponse.json({ error: "This photo uses the old Google storage provider. Re-upload it to move it to R2." }, { status: 410 });
  } catch (error) {
    console.error("Teacher photo read error:", error);
    return NextResponse.json({ error: "Unable to load teacher photo" }, { status: 500 });
  }
}
