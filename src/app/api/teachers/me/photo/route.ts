import { NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";

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
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: "Photo storage is not configured" }, { status: 500 });

    const original = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(original).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const previousPhoto = access.teacher.profilePhotoUrl;
    const objectName = `teachers/${String(access.teacher._id)}/profile-${Date.now()}.jpg`;
    const bucket = storageClient().bucket(bucketName);
    await bucket.file(objectName).save(compressed, { contentType: "image/jpeg", resumable: false, metadata: { cacheControl: "private, max-age=3600" } });
    access.teacher.profilePhotoUrl = `gs://${bucketName}/${objectName}`;
    await access.teacher.save();
    if (previousPhoto && previousPhoto.startsWith("gs://")) await bucket.file(objectPath(previousPhoto)).delete({ ignoreNotFound: true }).catch((error) => console.warn("Previous teacher photo cleanup failed:", error));
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
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: "Photo storage is not configured" }, { status: 500 });
    const [url] = await storageClient().bucket(bucketName).file(objectPath(access.teacher.profilePhotoUrl)).getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Teacher photo read error:", error);
    return NextResponse.json({ error: "Unable to load teacher photo" }, { status: 500 });
  }
}
