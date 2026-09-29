import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher } from "@/Models";

export async function GET() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "teacher") return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
    const assignedClasses = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean) : [];
    return NextResponse.json({ assignedClasses });
  } catch (error) {
    console.error("Teacher classes error:", error);
    return NextResponse.json({ error: "Unable to load assigned classes" }, { status: 500 });
  }
}
