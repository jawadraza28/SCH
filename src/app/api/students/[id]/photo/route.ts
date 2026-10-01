import { NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student, Teacher } from "@/Models";

let cachedStorage: Storage | null = null;

function storageClient() {
  if (cachedStorage) return cachedStorage;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CLOUD_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Google Cloud Storage is not configured");
  cachedStorage = new Storage({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } });
  return cachedStorage;
}

function objectPath(value: string) {
  return value.replace(/^gs:\/\/[^/]+\//, "");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user || session.user.role !== "teacher") return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  try {
    const { id } = await context.params;
    await connectToDatabase();
    const student = await Student.findById(id);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const teacher = await Teacher.findOne({ cnic: session.user.cnic }).select("assignedClasses").lean();
    const assignedClasses = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item).trim().toUpperCase()) : [];
    const studentClass = `${student.class}-${student.section}`.trim().toUpperCase();
    if (!assignedClasses.includes(studentClass)) return NextResponse.json({ error: "You can only upload photos for students in your assigned classes" }, { status: 403 });
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "A photo is required" }, { status: 400 });
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, and WebP images are allowed" }, { status: 400 });
    const maxUploadMb = Math.max(1, Number(process.env.STUDENT_PHOTO_MAX_UPLOAD_MB ?? 5));
    if (file.size > maxUploadMb * 1024 * 1024) return NextResponse.json({ error: `Photo must be ${maxUploadMb} MB or smaller` }, { status: 400 });
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: "Photo storage is not configured" }, { status: 500 });
    const original = Buffer.from(await file.arrayBuffer());
    let quality = 82;
    let compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    while (compressed.length > 230 * 1024 && quality > 45) {
      quality -= 5;
      compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    }
    const previousPhoto = student.profilePhotoUrl;
    const objectName = `students/${String(student._id)}/profile-${Date.now()}.jpg`;
    const bucket = storageClient().bucket(bucketName);
    await bucket.file(objectName).save(compressed, { contentType: "image/jpeg", resumable: false, metadata: { cacheControl: "private, max-age=3600" } });
    student.profilePhotoUrl = `gs://${bucketName}/${objectName}`;
    await student.save();
    if (previousPhoto && previousPhoto.startsWith("gs://")) {
      await bucket.file(objectPath(previousPhoto)).delete({ ignoreNotFound: true }).catch((error) => console.warn("Previous student photo cleanup failed:", error));
    }
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
    const path = objectPath(student.profilePhotoUrl);
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: "Photo storage is not configured" }, { status: 500 });
    const [url] = await storageClient().bucket(bucketName).file(path).getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return NextResponse.redirect(url);
  } catch (error) { console.error("Student photo read error:", error); return NextResponse.json({ error: "Unable to load student photo", detail: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined }, { status: 500 }); }
}
