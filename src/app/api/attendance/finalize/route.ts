import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { markScheduledAbsences } from "@/lib/attendance-qr";

const defaultAttendanceDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export async function POST() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  try {
    await connectToDatabase();
    const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).select("schoolTimezone attendanceAbsentAfter attendanceDays").lean() : null;
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    const result = await markScheduledAbsences({
      now: new Date(),
      timeZone: school.schoolTimezone || "Asia/Karachi",
      absentAfter: school.attendanceAbsentAfter || "09:00",
      attendanceDays: school.attendanceDays ?? defaultAttendanceDays,
      markedBy: session.user.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Attendance absence finalization error:", error);
    return NextResponse.json({ error: "Unable to finalize attendance" }, { status: 500 });
  }
}
