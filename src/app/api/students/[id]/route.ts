import { NextResponse } from "next/server";
import { getCurrentUser, normalizeCNIC } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student, Teacher, User } from "@/Models";

async function canAccessStudent(id: string) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user || !["admin", "teacher"].includes(session.user.role)) return null;
  await connectToDatabase();
  const student = await Student.findById(id);
  if (!student) return { session: session.user, student: null };
  if (session.user.role === "admin") return { session: session.user, student };
  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
  const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).toUpperCase());
  const classSection = `${student.class}-${student.section}`.toUpperCase();
  return assigned.includes(classSection) ? { session: session.user, student } : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await canAccessStudent((await context.params).id);
    if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!access.student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const student = access.student.toObject();
    return NextResponse.json({ student });
  } catch (error) {
    console.error("Student detail error:", error);
    return NextResponse.json({ error: "Unable to load student" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const id = (await context.params).id;
    const fullName = String(body.fullName ?? "").trim();
    const cnic = normalizeCNIC(String(body.cnic ?? "").trim());
    const className = String(body.className ?? "").trim();
    const section = String(body.section ?? "").trim().toUpperCase();
    const rollNumber = String(body.rollNumber ?? "").trim();
    const gender = String(body.gender ?? "").trim();
    if (!fullName || !/^\d{5}-\d{7}-\d$/.test(cnic) || !className || !section || !rollNumber || !["male", "female", "other"].includes(gender)) return NextResponse.json({ error: "Full name, valid CNIC, class, section, roll number, and gender are required" }, { status: 400 });
    const access = await canAccessStudent(id);
    if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!access.student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (access.session.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: access.session.cnic }).lean();
      const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).toUpperCase());
      if (!assigned.includes(`${className}-${section}`.toUpperCase())) return NextResponse.json({ error: "You can only move students within your assigned classes" }, { status: 403 });
    }
    const student = access.student;
    const duplicateCnic = await Student.findOne({ _id: { $ne: id }, cnic }).select("_id").lean();
    if (duplicateCnic) return NextResponse.json({ error: "Another student already uses this CNIC" }, { status: 409 });
    const duplicateRoll = await Student.findOne({ _id: { $ne: id }, class: className, section, rollNumber }).select("_id").lean();
    if (duplicateRoll) return NextResponse.json({ error: `Roll number ${rollNumber} is already used in class ${className}-${section}.` }, { status: 409 });
    const previousCNIC = student.cnic;
    student.fullName = fullName; student.cnic = cnic; student.class = className; student.section = section; student.rollNumber = rollNumber; student.gender = gender;
    student.fatherName = String(body.fatherName ?? "").trim(); student.fatherPhone = String(body.fatherPhone ?? "").trim(); student.homeAddress = String(body.homeAddress ?? "").trim();
    await student.save();
    const user = await User.findOne({ role: "student", $or: [{ cnic: previousCNIC }, { cnic }] });
    if (user) { user.name = fullName; user.cnic = cnic; user.isActive = student.accountStatus === "active"; await user.save(); }
    return NextResponse.json({ success: true, student });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "Another student already uses this CNIC or this roll number in the same class." }, { status: 409 });
    }
    console.error("Student update error:", error);
    return NextResponse.json({ error: "Unable to update student" }, { status: 500 });
  }
}
