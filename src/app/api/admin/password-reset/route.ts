import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student, Teacher, User } from "@/Models";

function temporaryPassword() {
  return `SCH-${crypto.randomBytes(5).toString("hex")}`;
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const role = body.role === "student" || body.role === "teacher" ? body.role : "";
    const recordId = String(body.id ?? "");
    if (!role || !/^[0-9a-fA-F]{24}$/.test(recordId)) {
      return NextResponse.json({ error: "A valid student or teacher is required" }, { status: 400 });
    }
    await connectToDatabase();
    const record = role === "student"
      ? await Student.findById(recordId).select("cnic")
      : await Teacher.findById(recordId).select("cnic");
    if (!record) return NextResponse.json({ error: `${role === "student" ? "Student" : "Teacher"} not found` }, { status: 404 });
    const user = await User.findOne({ cnic: record.cnic, role, school: session.user.school });
    if (!user) return NextResponse.json({ error: "Login account not found for this person" }, { status: 404 });
    const password = temporaryPassword();
    user.password = await hashPassword(password);
    user.passwordChangedAt = new Date();
    user.firstLoginCompleted = false;
    await user.save();
    return NextResponse.json({ success: true, temporaryPassword: password });
  } catch (error) {
    console.error("Admin password reset error:", error);
    return NextResponse.json({ error: "Unable to reset password" }, { status: 500 });
  }
}
