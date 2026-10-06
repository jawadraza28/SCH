import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

export function cloudinaryMissingVariables() {
  return ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].filter((name) => !process.env[name]);
}

export function cloudinaryError(error: unknown) {
  const candidate = error as { message?: unknown; http_code?: unknown; name?: unknown; code?: unknown };
  const message = typeof candidate?.message === "string" ? candidate.message : "Cloudinary rejected the image upload";
  const status = typeof candidate?.http_code === "number" ? candidate.http_code : undefined;
  const code = typeof candidate?.code === "string" ? candidate.code : typeof candidate?.name === "string" ? candidate.name : "CLOUDINARY_UPLOAD_FAILED";
  return { message, status, code };
}

export async function verifyCloudinary() {
  if (!cloudinaryConfigured()) return { ok: false as const, missing: cloudinaryMissingVariables() };
  try {
    await cloudinary.api.ping();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: cloudinaryError(error) };
  }
}

/**
 * Uploads an already-compressed image buffer to Cloudinary.
 *
 * `maxDimension` caps the longest side; profile photos stay square-ish at 800,
 * while wide landing imagery (hero cover, gallery) can pass a larger value so
 * the picture still looks sharp on a desktop screen.
 */
export async function uploadImage(buffer: Buffer, folder: string, maxDimension = 800) {
  return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder,
      resource_type: "image",
      transformation: [{ width: maxDimension, height: maxDimension, crop: "limit", quality: "auto", fetch_format: "auto" }],
    }, (error, result) => {
      if (error || !result?.secure_url || !result.public_id) {
        reject(error ?? new Error("Cloudinary did not return an uploaded image"));
        return;
      }
      resolve({ secure_url: result.secure_url, public_id: result.public_id });
    });
    stream.end(buffer);
  });
}

/** Profile photos (students, teachers, principal): capped at 800px. */
export async function uploadProfilePhoto(buffer: Buffer, folder: string) {
  return uploadImage(buffer, folder, 800);
}

export async function deleteCloudinaryPhoto(publicId?: string) {
  if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

export default cloudinary;
