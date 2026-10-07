import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ExamSchedule, ExamTerm, Student, Teacher } from "@/Models";

type Entry = { date?: unknown; subject?: unknown; startTime?: unknown; endTime?: unknown; room?: unknown };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** The class sections this user is allowed to read/write exam sheets for. */
async function sessionAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 as const };
  const user = session.user;
  if (user.role === "admin") return { id: user.id, role: user.role as "admin", school: user.school, classes: null as string[] | null };
  if (user.role === "teacher") {
    const teacher = await Teacher.findOne({ cnic: user.cnic }).select("assignedClasses").lean();
    const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).trim().toUpperCase());
    return { id: user.id, role: "teacher" as const, school: user.school, classes: assigned };
  }
  const student = await Student.findOne({ cnic: user.cnic }).select("class section").lean();
  const own = student ? [`${student.class}-${student.section}`.toUpperCase()] : [];
  return { id: user.id, role: "student" as const, school: user.school, classes: own };
}

export async function GET(request: Request) {
  const access = await sessionAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const termFilter = params.get("examTerm")?.trim();
    const classFilter = params.get("classSection")?.trim().toUpperCase();

    const query: Record<string, unknown> = {};
    if (access.role === "admin") query.school = access.school;
    else query.classSection = { $in: access.classes ?? [] };
    if (classFilter) {
      if (access.role !== "admin" && !(access.classes ?? []).includes(classFilter)) {
        return NextResponse.json({ error: "You are not allowed to view this class" }, { status: 403 });
      }
      query.classSection = classFilter;
    }
    if (termFilter) query.examTerm = termFilter;

    const [schedules, terms] = await Promise.all([
      ExamSchedule.find(query).populate("examTerm", "title startDate endDate academicYear isActive").sort({ classSection: 1 }).lean(),
      ExamTerm.find(access.role === "admin" ? { school: access.school } : { school: access.school, isActive: true })
        .sort({ startDate: -1, createdAt: -1 })
        .select("title academicYear startDate endDate description isActive")
        .lean(),
    ]);
    return NextResponse.json({ schedules, terms, role: access.role, classes: access.classes });
  } catch (error) {
    console.error("Exam schedule load error:", error);
    return NextResponse.json({ error: "Unable to load exam schedules" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await sessionAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.role === "student") return NextResponse.json({ error: "Students cannot publish exam timetables" }, { status: 403 });
  try {
    const body = await request.json();
    const examTerm = String(body.examTerm ?? "").trim();
    const classSection = String(body.classSection ?? "").trim().toUpperCase();
    const entries = Array.isArray(body.entries) ? (body.entries as Entry[]) : [];
    if (!examTerm || !classSection) return NextResponse.json({ error: "Exam term and class are required" }, { status: 400 });
    if (access.role === "teacher" && !(access.classes ?? []).includes(classSection)) {
      return NextResponse.json({ error: "You can only publish the timetable for your assigned classes" }, { status: 403 });
    }

    const normalized: Array<{ date: string; subject: string; startTime: string; endTime: string; room: string }> = [];
    for (const entry of entries) {
      const date = String(entry.date ?? "").trim();
      const subject = String(entry.subject ?? "").trim();
      if (!datePattern.test(date)) return NextResponse.json({ error: "Every exam needs a valid date (YYYY-MM-DD)" }, { status: 400 });
      if (!subject) return NextResponse.json({ error: "Every exam needs a subject" }, { status: 400 });
      normalized.push({
        date,
        subject,
        startTime: String(entry.startTime ?? "").trim(),
        endTime: String(entry.endTime ?? "").trim(),
        room: String(entry.room ?? "").trim(),
      });
    }
    normalized.sort((a, b) => a.date.localeCompare(b.date));

    await connectToDatabase();
    const term = await ExamTerm.findOne({ _id: examTerm, school: access.school }).lean();
    if (!term) return NextResponse.json({ error: "Exam term not found" }, { status: 404 });

    const schedule = await ExamSchedule.findOneAndUpdate(
      { examTerm, classSection },
      { examTerm, classSection, school: access.school, academicYear: term.academicYear, entries: normalized, updatedBy: access.id },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    console.error("Exam schedule save error:", error);
    return NextResponse.json({ error: "Unable to save exam timetable" }, { status: 500 });
  }
}