import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cloudinaryError, verifyCloudinary } from "@/lib/cloudinary";

export async function GET() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }

  const result = await verifyCloudinary();
  if (result.ok) return NextResponse.json({ ok: true, provider: "cloudinary" });
  if ("missing" in result) {
    return NextResponse.json({ ok: false, code: "CLOUDINARY_ENV_MISSING", missing: result.missing }, { status: 503 });
  }
  const error = cloudinaryError(result.error);
  console.error("Cloudinary health check failed:", error);
  return NextResponse.json({ ok: false, code: error.code, detail: error.message }, { status: 502 });
}
