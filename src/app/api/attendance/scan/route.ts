import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, ClassSection, SchoolConfiguration, Student } from "@/Models";
import { attendanceClock, getSchoolLocalTime, markScheduledAbsences, statusForAttendanceScan } from "@/lib/attendance-qr";

const defaultAttendanceDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  try {
    await connectToDatabase();
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!/^[\da-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid student QR code" }, { status: 400 });

    const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).select("schoolTimezone attendanceStartTime attendanceLateAfter attendanceAbsentAfter attendanceDays").lean() : null;
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    const timeZone = school.schoolTimezone || "Asia/Karachi";
    const startTime = school.attendanceStartTime || "07:00";
    const lateAfter = school.attendanceLateAfter || "08:00";
    const absentAfter = school.attendanceAbsentAfter || "09:00";
    const days = school.attendanceDays ?? defaultAttendanceDays;
    const now = new Date();
    const localTime = getSchoolLocalTime(now, timeZone);
    if (!days.includes(localTime.weekday)) return NextResponse.json({ error: "Attendance is not scheduled for today" }, { status: 400 });
    if (attendanceClock(lateAfter) < attendanceClock(startTime) || attendanceClock(absentAfter) <= attendanceClock(lateAfter)) {
      return NextResponse.json({ error: "Attendance time settings are invalid. Please check school settings." }, { status: 500 });
    }

    await markScheduledAbsences({ now, timeZone, absentAfter, attendanceDays: days, markedBy: session.user.id });
    const student = await Student.findOne({ attendanceQrToken: token, accountStatus: "active" })
      .select("fullName studentId class section rollNumber academicYear")
      .lean();
    if (!student) return NextResponse.json({ error: "Student QR code was not found or the student is inactive" }, { status: 404 });

    const section = await ClassSection.findOne({
      className: student.class,
      sectionName: student.section,
      isActive: true,
      startDate: { $lte: localTime.date },
      endDate: { $gte: localTime.date },
    }).select("academicYear").lean();
    if (!section) return NextResponse.json({ error: "The student's class does not have an active session today" }, { status: 400 });

    const attendanceDate = new Date(`${localTime.date}T00:00:00.000Z`);
    const academicYear = section.academicYear || student.academicYear || "";
    const status = statusForAttendanceScan(localTime.minute, lateAfter);
    const existing = await Attendance.findOne({ student: student._id, academicYear, date: attendanceDate });
    if (existing?.checkInAt) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        status: existing.status,
        checkInAt: existing.checkInAt,
        student: { name: student.fullName, classSection: `${student.class}-${student.section}`, rollNumber: student.rollNumber },
      });
    }
    if (existing && ["leave", "holiday"].includes(existing.status)) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        status: existing.status,
        student: { name: student.fullName, classSection: `${student.class}-${student.section}`, rollNumber: student.rollNumber },
      });
    }

    if (existing) {
      existing.classSection = `${student.class}-${student.section}`;
      existing.status = status;
      existing.markedBy = session.user.id;
      existing.markedAt = now;
      existing.checkInAt = now;
      await existing.save();
    } else {
      await Attendance.create({
        student: student._id,
        classSection: `${student.class}-${student.section}`,
        academicYear,
        date: attendanceDate,
        status,
        markedBy: session.user.id,
        markedAt: now,
        checkInAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      duplicate: false,
      status,
      checkInAt: now,
      student: { name: student.fullName, classSection: `${student.class}-${student.section}`, rollNumber: student.rollNumber },
    });
  } catch (error) {
    console.error("Attendance QR scan error:", error);
    return NextResponse.json({ error: "Unable to record attendance from this QR code" }, { status: 500 });
  }
}
