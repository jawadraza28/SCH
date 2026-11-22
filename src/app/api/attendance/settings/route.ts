import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const allowedDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const defaultAttendanceDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const minutes = (time: string) => {
  const [hours, minute] = time.split(":").map(Number);
  return hours * 60 + minute;
};

async function adminSchool() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 as const };
  if (session.user.role !== "admin") return { error: "Administrator access required", status: 403 as const };
  return { schoolId: session.user.school };
}

export async function GET() {
  const access = await adminSchool();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findById(access.schoolId).select("schoolTimezone attendanceStartTime attendanceLateAfter attendanceAbsentAfter attendanceDays").lean();
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    return NextResponse.json({
      settings: {
        schoolTimezone: school.schoolTimezone || "Asia/Karachi",
        attendanceStartTime: school.attendanceStartTime || "07:00",
        attendanceLateAfter: school.attendanceLateAfter || "08:00",
        attendanceAbsentAfter: school.attendanceAbsentAfter || "09:00",
        attendanceDays: school.attendanceDays ?? defaultAttendanceDays,
      },
    });
  } catch (error) {
    console.error("Attendance settings load error:", error);
    return NextResponse.json({ error: "Unable to load attendance settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await adminSchool();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const startTime = typeof body.attendanceStartTime === "string" ? body.attendanceStartTime : "";
    const lateAfter = typeof body.attendanceLateAfter === "string" ? body.attendanceLateAfter : "";
    const absentAfter = typeof body.attendanceAbsentAfter === "string" ? body.attendanceAbsentAfter : "";
    const timeZone = typeof body.schoolTimezone === "string" ? body.schoolTimezone.trim() : "";
    const days = Array.isArray(body.attendanceDays) ? body.attendanceDays : [];
    if (![startTime, lateAfter, absentAfter].every((time) => timePattern.test(time))) {
      return NextResponse.json({ error: "Enter all attendance times in HH:mm format" }, { status: 400 });
    }
    if (minutes(lateAfter) < minutes(startTime) || minutes(absentAfter) <= minutes(lateAfter)) {
      return NextResponse.json({ error: "Times must be ordered: school start, late time, then absent cutoff" }, { status: 400 });
    }
    if (!timeZone) return NextResponse.json({ error: "School timezone is required" }, { status: 400 });
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      return NextResponse.json({ error: "Enter a valid timezone, such as Asia/Karachi" }, { status: 400 });
    }
    if (!days.length || days.some((day: unknown) => typeof day !== "string" || !allowedDays.includes(day))) {
      return NextResponse.json({ error: "Select at least one valid school day" }, { status: 400 });
    }

    await connectToDatabase();
    const school = await SchoolConfiguration.findById(access.schoolId);
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    school.schoolTimezone = timeZone;
    school.attendanceStartTime = startTime;
    school.attendanceLateAfter = lateAfter;
    school.attendanceAbsentAfter = absentAfter;
    school.attendanceDays = [...new Set(days)];
    await school.save();
    return NextResponse.json({
      success: true,
      settings: {
        schoolTimezone: school.schoolTimezone,
        attendanceStartTime: school.attendanceStartTime,
        attendanceLateAfter: school.attendanceLateAfter,
        attendanceAbsentAfter: school.attendanceAbsentAfter,
        attendanceDays: school.attendanceDays,
      },
    });
  } catch (error) {
    console.error("Attendance settings update error:", error);
    return NextResponse.json({ error: "Unable to save attendance settings" }, { status: 500 });
  }
}
