import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { cloudinaryConfigured, cloudinaryError, cloudinaryMissingVariables, deleteCloudinaryPhoto, uploadImage } from "@/lib/cloudinary";

/**
 * Landing-page image storage.
 *
 * The admin editor uploads every picture here (hero cover, logo, principal
 * portrait, top-student photos, news images, gallery). Files are compressed
 * with sharp and pushed to Cloudinary, which returns the secure URL the caller
 * stores on the school document; the matching public id is stored too so the
 * previous asset can be deleted when a picture is replaced or removed.
 */

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Where a picture is used decides how large it is kept on Cloudinary.
const KINDS = new Set(["cover", "logo", "principal", "topStudent", "news", "gallery"]);

function maxDimensionFor(kind: string) {
  if (kind === "logo") return 512;
  if (kind === "principal" || kind === "topStudent") return 800;
  return 1600;
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  try {
    await connectToDatabase();
    const form = await request.formData();
    const file = form.get("file");
    const requestedKind = String(form.get("kind") ?? "gallery").trim();
    const kind = KINDS.has(requestedKind) ? requestedKind : "gallery";
    if (!(file instanceof File)) return NextResponse.json({ error: "An image file is required" }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Only JPG, PNG, and WebP images are allowed" }, { status: 400 });
    const maxMb = Math.max(1, Number(process.env.LANDING_IMAGE_MAX_UPLOAD_MB ?? 6));
    if (file.size > maxMb * 1024 * 1024) return NextResponse.json({ error: `Image must be ${maxMb} MB or smaller` }, { status: 400 });
    if (!cloudinaryConfigured()) {
      console.error("Landing image upload blocked: missing Cloudinary variables", cloudinaryMissingVariables());
      return NextResponse.json({ error: "Image storage is not configured on the server. Add the Cloudinary environment variables, then redeploy." }, { status: 503 });
    }

    const maxDimension = maxDimensionFor(kind);
    const original = Buffer.from(await file.arrayBuffer());
    let quality = 82;
    const resize = () => sharp(original).rotate().resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    let compressed = await resize();
    // Step the quality down until the image is comfortably small.
    while (compressed.length > 320 * 1024 && quality > 45) {
      quality -= 5;
      compressed = await resize();
    }

    const folder = `school/${session.user.school ?? "shared"}/landing/${kind}`;
    try {
      const uploaded = await uploadImage(compressed, folder, maxDimension);
      return NextResponse.json({ success: true, url: uploaded.secure_url, publicId: uploaded.public_id });
    } catch (error) {
      const cloudinary = cloudinaryError(error);
      console.error("Cloudinary landing image rejected:", cloudinary);
      return NextResponse.json({ error: "Cloudinary rejected this image upload.", code: cloudinary.code, detail: cloudinary.message }, { status: 502 });
    }
  } catch (error) {
    console.error("Landing image upload error:", error);
    return NextResponse.json({ error: "Unable to upload the image. Check the Cloudinary credentials and the function logs." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { publicId?: unknown };
    const publicId = typeof body.publicId === "string" ? body.publicId : "";
    if (!publicId) return NextResponse.json({ error: "A publicId is required" }, { status: 400 });
    await deleteCloudinaryPhoto(publicId).catch((error) => console.warn("Landing image cleanup failed:", error));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Landing image delete error:", error);
    return NextResponse.json({ error: "Unable to delete the image" }, { status: 500 });
  }
}