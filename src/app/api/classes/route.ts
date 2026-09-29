import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection } from "@/Models";

async function adminAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "admin") return { error: "Administrator access required", status: 403 };
  return { user: session.user };
}

export async function GET() {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    const classes = await ClassSection.find({ isActive: true }).sort({ className: 1, sectionName: 1 }).lean();
    return NextResponse.json({ classes });
  } catch (error) {
    console.error("Class list error:", error);
    return NextResponse.json({ error: "Unable to load classes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const className = String(body.className ?? "").trim();
    const sectionName = String(body.sectionName ?? "").trim().toUpperCase();
    const academicYear = String(body.academicYear ?? "2026-2027").trim();
    if (!className || !sectionName || !academicYear) return NextResponse.json({ error: "Class, section, and academic year are required" }, { status: 400 });
    await connectToDatabase();
    const duplicate = await ClassSection.findOne({ className, sectionName, academicYear }).lean();
    if (duplicate) return NextResponse.json({ error: "This class and section already exists" }, { status: 409 });
    const created = await ClassSection.create({ className, sectionName, academicYear, capacity: Number(body.capacity) || 50 });
    return NextResponse.json({ success: true, classSection: created }, { status: 201 });
  } catch (error) {
    console.error("Class creation error:", error);
    return NextResponse.json({ error: "Unable to create class" }, { status: 500 });
  }
}
