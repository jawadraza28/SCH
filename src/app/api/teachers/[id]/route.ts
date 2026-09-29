import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher, User } from "@/Models";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const teacher = await Teacher.findById((await context.params).id).lean();
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    const user = await User.findOne({ role: "teacher", cnic: teacher.cnic }).select("email").lean();
    return NextResponse.json({ teacher: { ...teacher, email: user?.email ?? "" } });
  } catch (error) {
    console.error("Teacher detail error:", error);
    return NextResponse.json({ error: "Unable to load teacher" }, { status: 500 });
  }
}
