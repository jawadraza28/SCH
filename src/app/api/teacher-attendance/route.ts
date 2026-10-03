import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher, TeacherAttendance } from "@/Models";
import { pruneTeacherAttendanceIfDue } from "@/lib/retention";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const date = params.get("date")?.trim();
    const status = params.get("status")?.trim();
    const teacherId = params.get("teacherId")?.trim();
    const teacherQuery: Record<string, unknown> = { ...(teacherId ? { _id: teacherId } : {}) };
    if (status && ["present", "absent", "late", "leave", "holiday"].includes(status) && date) {
      const marked = await TeacherAttendance.find({ date: day(date), status }).distinct("teacher");
      teacherQuery._id = { $in: marked };
    }
    const paginated = params.has("page");
    const limit = paginated ? parsePageSize(params.get("limit"), 20) : 200;
    const total = await Teacher.countDocuments(teacherQuery);
    const pages = countPages(total, limit);
    const page = paginated ? clampPage(parsePageNumber(params.get("page")), pages) : 1;
    const teachers = await Teacher.find(teacherQuery).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean();
    const query: Record<string, unknown> = {};
    if (teacherId) query.teacher = teacherId;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) query.date = day(date);
    const records = await TeacherAttendance.find(query).sort({ date: -1 }).lean();
    if (params.get("export") === "csv") {
      const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
      const teachersById = new Map(teachers.map((teacher) => [String(teacher._id), teacher.name]));
      const rows = ["Teacher,Date,Status", ...records.map((record) => [teachersById.get(String(record.teacher)) ?? String(record.teacher), new Date(record.date).toISOString().slice(0, 10), record.status].map(escape).join(","))];
      return new Response(rows.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="teacher-attendance-${date ?? "report"}.csv"` } });
    }
    return NextResponse.json({ teachers, records, pagination: { page, pages, total, limit } });
  } catch (error) {
    console.error("Teacher attendance load error:", error);
    return NextResponse.json({ error: "Unable to load teacher attendance" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const adminUser = session.user;
  try {
    await connectToDatabase();
    const body = await request.json();
    const date = String(body.date ?? "").trim();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entries.length) return NextResponse.json({ error: "Date and attendance entries are required" }, { status: 400 });
    const allowed = new Set(["present", "absent", "late", "leave", "holiday"]);
    const teacherIds = entries.map((entry: { teacherId: string }) => entry.teacherId);
    const valid = new Set((await Teacher.find({ _id: { $in: teacherIds } }).select("_id").lean()).map((teacher) => String(teacher._id)));
    await Promise.all(entries.filter((entry: { teacherId: string; status: string }) => valid.has(entry.teacherId) && (allowed.has(entry.status) || entry.status === "unmarked")).map((entry: { teacherId: string; status: string }) => entry.status === "unmarked"
      ? TeacherAttendance.deleteOne({ teacher: entry.teacherId, date: day(date) })
      : TeacherAttendance.findOneAndUpdate({ teacher: entry.teacherId, date: day(date) }, { teacher: entry.teacherId, date: day(date), status: entry.status, markedBy: adminUser.id }, { upsert: true, new: true })));
    await pruneTeacherAttendanceIfDue();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Teacher attendance save error:", error);
    return NextResponse.json({ error: "Unable to save teacher attendance" }, { status: 500 });
  }
}
