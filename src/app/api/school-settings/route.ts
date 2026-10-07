import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration, User } from "@/Models";
import { signedR2Url } from "@/lib/object-storage";

const imageFields = ["logo", "schoolIcon", "coverImage"] as const;
const socialFields = ["facebook", "instagram", "youtube", "whatsapp", "linkedin"] as const;

async function withSignedImages<T extends Record<string, unknown> | null>(school: T) {
  if (!school) return null;
  const result = { ...school };
  for (const field of imageFields) {
    const value = result[field];
    if (typeof value === "string" && value.startsWith("r2://")) result[field] = await signedR2Url(value);
  }
  return result;
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  await connectToDatabase();
  const school = await SchoolConfiguration.findById(session.user.school).lean();
  const administrator = await User.findById(session.user.id).select("name email cnic role").lean();
  return NextResponse.json({ school: await withSignedImages(school), administrator });
}

export async function PATCH(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findById(session.user.school);
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    const administrator = await User.findOne({ _id: session.user.id, role: "admin", school: session.user.school });
    if (!administrator) return NextResponse.json({ error: "Administrator account not found" }, { status: 404 });
    const form = await request.formData();
    for (const field of ["schoolName", "schoolAddress", "schoolPhone", "schoolEmail", "schoolDescription", "schoolTimezone", "subscriptionPlan"]) {
      const value = form.get(field);
      if (typeof value === "string") school[field] = value.trim();
    }
    for (const field of socialFields) {
      const value = form.get(`social${field[0].toUpperCase()}${field.slice(1)}`);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed && !/^https?:\/\/\S+$/i.test(trimmed)) {
          return NextResponse.json({ error: `Enter a valid https:// URL for ${field}` }, { status: 400 });
        }
        school.set(`socialMedia.${field}`, trimmed);
      }
    }
    const monthlyFee = form.get("monthlyFee");
    if (typeof monthlyFee === "string" && monthlyFee.trim()) school.monthlyFee = Number(monthlyFee);
    if (!Number.isFinite(school.monthlyFee) || school.monthlyFee < 0) return NextResponse.json({ error: "Monthly fee must be a valid positive number" }, { status: 400 });
    const adminName = form.get("adminName");
    const adminEmail = form.get("adminEmail");
    const adminCNIC = form.get("adminCNIC");
    if (typeof adminName === "string") {
      const value = adminName.trim();
      if (value.length < 2) return NextResponse.json({ error: "Administrator name must be at least 2 characters" }, { status: 400 });
      administrator.name = value;
    }
    if (typeof adminEmail === "string") {
      const value = adminEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return NextResponse.json({ error: "Enter a valid administrator email" }, { status: 400 });
      const existing = await User.findOne({ email: value, _id: { $ne: administrator._id } }).select("_id").lean();
      if (existing) return NextResponse.json({ error: "That administrator email is already in use" }, { status: 409 });
      administrator.email = value;
    }
    if (typeof adminCNIC === "string") {
      const value = adminCNIC.trim();
      if (value && !/^\d{5}-\d{7}-\d$/.test(value) && !/^\d{13}$/.test(value)) return NextResponse.json({ error: "Enter a valid administrator CNIC" }, { status: 400 });
      if (value) {
        const existing = await User.findOne({ cnic: value, _id: { $ne: administrator._id } }).select("_id").lean();
        if (existing) return NextResponse.json({ error: "That administrator CNIC is already in use" }, { status: 409 });
      }
      administrator.cnic = value;
    }
    await school.save();
    await administrator.save();
    return NextResponse.json({ success: true, school: await withSignedImages(school.toObject()), administrator: { name: administrator.name, email: administrator.email, cnic: administrator.cnic, role: administrator.role } });
  } catch (error) {
    console.error("School settings update error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update school settings" }, { status: 500 });
  }
}
