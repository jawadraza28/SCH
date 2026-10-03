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

export async function uploadProfilePhoto(buffer: Buffer, folder: string) {
  return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder,
      resource_type: "image",
      transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto", fetch_format: "auto" }],
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

export async function deleteCloudinaryPhoto(publicId?: string) {
  if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

export default cloudinary;
