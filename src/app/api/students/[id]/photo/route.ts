import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student, Teacher } from "@/Models";
import { cloudinaryConfigured, deleteCloudinaryPhoto, uploadProfilePhoto } from "@/lib/cloudinary";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user || !["admin", "teacher"].includes(session.user.role)) return NextResponse.json({ error: "Administrator or teacher access required" }, { status: 403 });
  try {
    const { id } = await context.params;
    await connectToDatabase();
    const student = await Student.findById(id);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (session.user.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: session.user.cnic }).select("assignedClasses").lean();
      const assignedClasses = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item).trim().toUpperCase()) : [];
      const studentClass = `${student.class}-${student.section}`.trim().toUpperCase();
      if (!assignedClasses.includes(studentClass)) return NextResponse.json({ error: "You can only upload photos for students in your assigned classes" }, { status: 403 });
    }
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "A photo is required" }, { status: 400 });
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, and WebP images are allowed" }, { status: 400 });
    const maxUploadMb = Math.max(1, Number(process.env.STUDENT_PHOTO_MAX_UPLOAD_MB ?? 5));
    if (file.size > maxUploadMb * 1024 * 1024) return NextResponse.json({ error: `Photo must be ${maxUploadMb} MB or smaller` }, { status: 400 });
    if (!cloudinaryConfigured()) return NextResponse.json({ error: "Cloudinary photo storage is not configured" }, { status: 500 });
    const original = Buffer.from(await file.arrayBuffer());
    let quality = 82;
    let compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    while (compressed.length > 230 * 1024 && quality > 45) {
      quality -= 5;
      compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    }
    const uploaded = await uploadProfilePhoto(compressed, `school/students/${String(student._id)}`);
    const previousPublicId = student.profilePhotoPublicId;
    student.profilePhotoUrl = uploaded.secure_url;
    student.profilePhotoPublicId = uploaded.public_id;
    try {
      await student.save();
    } catch (error) {
      await deleteCloudinaryPhoto(uploaded.public_id).catch((cleanupError) => console.warn("Failed to clean up student photo after database failure:", cleanupError));
      throw error;
    }
    if (previousPublicId) await deleteCloudinaryPhoto(previousPublicId).catch((error) => console.warn("Previous student photo cleanup failed:", error));
    return NextResponse.json({ success: true, photo: student.profilePhotoUrl });
  } catch (error) { console.error("Student photo upload error:", error); return NextResponse.json({ error: "Unable to upload student photo", detail: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined }, { status: 500 }); }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    await connectToDatabase();
    const student = await Student.findById(id).select("profilePhotoUrl cnic").lean();
    if (!student?.profilePhotoUrl) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    if (session.user.role === "student" && session.user.cnic !== student.cnic) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (student.profilePhotoUrl.startsWith("http")) return NextResponse.redirect(student.profilePhotoUrl);
    return NextResponse.json({ error: "This photo uses an old storage provider. Re-upload it to Cloudinary." }, { status: 410 });
  } catch (error) { console.error("Student photo read error:", error); return NextResponse.json({ error: "Unable to load student photo", detail: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined }, { status: 500 }); }
}
