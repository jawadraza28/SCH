import { randomUUID } from "node:crypto";
import { Attendance, ClassSection, Student } from "@/Models";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export async function ensureStudentAttendanceQrToken(studentId: string): Promise<string> {
  await Student.updateOne(
    { _id: studentId, attendanceQrToken: { $in: [null, ""] } },
    { $set: { attendanceQrToken: randomUUID() } },
  );
  const student = await Student.findById(studentId).select("+attendanceQrToken").lean();
  if (!student?.attendanceQrToken) throw new Error("Unable to create the student's attendance QR code");
  return student.attendanceQrToken;
}

export function attendanceClock(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error("Attendance times must use HH:mm format");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function getSchoolLocalTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = value("weekday").toLowerCase();
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minute: Number(value("hour")) * 60 + Number(value("minute")),
    weekday: WEEKDAYS.includes(weekday as (typeof WEEKDAYS)[number]) ? weekday : "",
  };
}

export function statusForAttendanceScan(minute: number, lateAfter: string) {
  if (minute >= attendanceClock(lateAfter)) return "late" as const;
  return "present" as const;
}

export async function markScheduledAbsences(options: {
  now: Date;
  timeZone: string;
  absentAfter: string;
  attendanceDays: string[];
  markedBy: string;
}) {
  const localTime = getSchoolLocalTime(options.now, options.timeZone);
  if (!options.attendanceDays.includes(localTime.weekday)) return { date: localTime.date, markedAbsent: 0, skipped: "not a scheduled school day" };
  if (localTime.minute < attendanceClock(options.absentAfter)) return { date: localTime.date, markedAbsent: 0, skipped: "absence cutoff has not passed" };

  const attendanceDate = new Date(`${localTime.date}T00:00:00.000Z`);
  const sections = await ClassSection.find({
    isActive: true,
    startDate: { $lte: localTime.date },
    endDate: { $gte: localTime.date },
  }).select("className sectionName academicYear").lean();
  let markedAbsent = 0;

  for (const section of sections) {
    const students = await Student.find({
      class: section.className,
      section: section.sectionName,
      accountStatus: "active",
    }).select("_id").lean();
    const classSection = `${section.className}-${section.sectionName}`;
    const existing = await Attendance.find({
      student: { $in: students.map((student) => student._id) },
      academicYear: section.academicYear,
      date: attendanceDate,
    }).select("student").lean();
    const alreadyMarked = new Set(existing.map((record) => String(record.student)));
    const missingStudents = students.filter((student) => !alreadyMarked.has(String(student._id)));
    if (missingStudents.length) {
      const result = await Attendance.bulkWrite(missingStudents.map((student) => ({
        updateOne: {
          filter: { student: student._id, academicYear: section.academicYear, date: attendanceDate },
          update: {
            $setOnInsert: {
              student: student._id,
              classSection,
              academicYear: section.academicYear,
              date: attendanceDate,
              status: "absent",
              markedBy: options.markedBy,
              markedAt: options.now,
            },
          },
          upsert: true,
        },
      })), { ordered: false });
      markedAbsent += result.upsertedCount;
    }
  }

  return { date: localTime.date, markedAbsent, skipped: null };
}
