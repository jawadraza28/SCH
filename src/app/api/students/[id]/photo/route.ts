import { NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student } from "@/Models";

function storageClient() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CLOUD_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Google Cloud Storage is not configured");
  return new Storage({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "A photo is required" }, { status: 400 });
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, and WebP images are allowed" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Photo must be 5 MB or smaller" }, { status: 400 });
    await connectToDatabase();
    const student = await Student.findById(id);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: "Photo storage is not configured" }, { status: 500 });
    const original = Buffer.from(await file.arrayBuffer());
    let quality = 82;
    let compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    while (compressed.length > 230 * 1024 && quality > 45) {
      quality -= 5;
      compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    }
    const objectName = `students/${String(student._id)}/profile-${Date.now()}.jpg`;
    const bucket = storageClient().bucket(bucketName);
    await bucket.file(objectName).save(compressed, { contentType: "image/jpeg", resumable: false, metadata: { cacheControl: "private, max-age=3600" } });
    student.profilePhotoUrl = `gs://${bucketName}/${objectName}`;
    await student.save();
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
    const path = student.profilePhotoUrl.replace(/^gs:\/\/[^/]+\//, "");
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: "Photo storage is not configured" }, { status: 500 });
    const [url] = await storageClient().bucket(bucketName).file(path).getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return NextResponse.redirect(url);
  } catch (error) { console.error("Student photo read error:", error); return NextResponse.json({ error: "Unable to load student photo", detail: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined }, { status: 500 }); }
}
