import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Student, Teacher } from "@/Models";
import { pruneRetentionIfDue } from "@/lib/retention";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

async function accessFor(classSection: string) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role === "admin") return { user: session.user };
  if (session.user.role !== "teacher") return { error: "Teacher or administrator access required", status: 403 };
  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
  const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).toUpperCase());
  if (!assigned.includes(classSection.toUpperCase())) return { error: "You are not assigned to this class", status: 403 };
  return { user: session.user };
}

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const className = params.get("class")?.trim() ?? "";
    const section = params.get("section")?.trim().toUpperCase() ?? "";
    const date = params.get("date")?.trim() ?? new Date().toISOString().slice(0, 10);
    if (!className || !section) return NextResponse.json({ error: "Class and section are required" }, { status: 400 });
    const classSection = `${className}-${section}`;
    const access = await accessFor(classSection);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    if (params.get("export") === "csv") {
      if (access.user.role !== "admin") return NextResponse.json({ error: "Only administrators can export attendance" }, { status: 403 });
      const records = await Attendance.find({ classSection, date: { $gte: new Date(`${date}T00:00:00.000Z`), $lt: new Date(`${date}T23:59:59.999Z`) } }).populate("student", "fullName studentId rollNumber").lean();
      const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
      const rows = ["Student,Student ID,Roll number,Class section,Date,Status", ...records.map((record) => {
        const student = record.student as { fullName?: string; studentId?: string; rollNumber?: string } | null;
        return [student?.fullName, student?.studentId, student?.rollNumber, record.classSection, date, record.status].map(escape).join(",");
      })];
      return new Response(rows.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-${classSection}-${date}.csv"` } });
    }
    const studentQuery = { class: className, section, accountStatus: { $in: ["active", "pending"] } };
    const paginated = params.has("page");
    const limit = paginated ? parsePageSize(params.get("limit"), 20) : 200;
    const total = await Student.countDocuments(studentQuery);
    const pages = countPages(total, limit);
    const page = paginated ? clampPage(parsePageNumber(params.get("page")), pages) : 1;
    const students = await Student.find(studentQuery).sort({ rollNumber: 1 }).skip((page - 1) * limit).limit(limit).lean();
    const records = await Attendance.find({ classSection, date: { $gte: new Date(`${date}T00:00:00.000Z`), $lt: new Date(`${date}T23:59:59.999Z`) } }).lean();
    const statusByStudent = new Map(records.map((record) => [String(record.student), record.status]));
      return NextResponse.json({ students: students.map((student) => ({ id: String(student._id), name: student.fullName, rollNumber: student.rollNumber, status: statusByStudent.get(String(student._id)) ?? "unmarked" })), pagination: { page, pages, total, limit } });
  } catch (error) {
    console.error("Attendance load error:", error);
    return NextResponse.json({ error: "Unable to load attendance" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const className = String(body.className ?? "").trim();
    const section = String(body.section ?? "").trim().toUpperCase();
    const date = String(body.date ?? "").trim();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!className || !section || !/^\d{4}-\d{2}-\d{2}$/.test(date) || entries.length === 0) return NextResponse.json({ error: "Class, section, date, and attendance entries are required" }, { status: 400 });
    const classSection = `${className}-${section}`;
    const access = await accessFor(classSection);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    const allowed = new Set(["present", "absent", "late", "leave", "holiday", "unmarked"]);
    const students = await Student.find({ _id: { $in: entries.map((entry: { studentId: string }) => entry.studentId) }, class: className, section, accountStatus: { $in: ["active", "pending"] } }).select("_id").lean();
    const validStudents = new Set(students.map((student) => String(student._id)));
    await Promise.all(entries.filter((entry: { studentId: string; status: string }) => validStudents.has(entry.studentId) && allowed.has(entry.status)).map((entry: { studentId: string; status: string }) => entry.status === "unmarked" ? Attendance.deleteOne({ student: entry.studentId, date: new Date(`${date}T00:00:00.000Z`) }) : Attendance.findOneAndUpdate({ student: entry.studentId, date: new Date(`${date}T00:00:00.000Z`) }, { student: entry.studentId, classSection, date: new Date(`${date}T00:00:00.000Z`), status: entry.status, markedBy: access.user.id }, { upsert: true, new: true })));
    await pruneRetentionIfDue();
    return NextResponse.json({ success: true, message: "Attendance saved" });
  } catch (error) {
    console.error("Attendance save error:", error);
    return NextResponse.json({ error: "Unable to save attendance" }, { status: 500 });
  }
}
