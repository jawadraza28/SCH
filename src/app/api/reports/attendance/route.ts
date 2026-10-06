import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, Student, TeacherAttendance } from "@/Models";
import { buildAttendanceDateFilter } from "@/lib/attendance";

const ALLOWED_STATUSES = ["present", "absent", "late", "leave", "holiday"] as const;
const validDate = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value as string : "";

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = validDate(params.get("from") ?? "");
  const to = validDate(params.get("to") ?? "");
  const month = params.get("month")?.trim() ?? "";
  const classSection = params.get("classSection")?.trim().toUpperCase() ?? "";
  const studentSearch = params.get("student")?.trim() ?? "";
  const status = params.get("status")?.trim() ?? "";
  const format = params.get("format")?.trim().toLowerCase() ?? "csv";

  if (!from && !to && !month) return NextResponse.json({ error: "A date range or month is required" }, { status: 400 });
  if (from && to && from > to) return NextResponse.json({ error: "From date must be before to date" }, { status: 400 });
  if (status && !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const filter = buildAttendanceDateFilter({ month, from, to });
    const match: Record<string, unknown> = { date: filter.date };
    if (classSection) match.classSection = classSection;
    if (status) match.status = status;

    // For student name search, first resolve matching student IDs, then filter the attendance query.
    let studentIds: string[] | undefined;
    if (studentSearch) {
      const regex = new RegExp(studentSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const students = await Student.find({
        $or: [{ fullName: regex }, { studentId: regex }, { rollNumber: regex }, { cnic: regex }],
      }).select("_id").lean();
      studentIds = students.map((s) => String(s._id));
      if (studentIds.length === 0) {
        return format === "json"
          ? NextResponse.json({ studentRecords: [], teacherRecords: [], counts: { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, unmarked: 0 }, total: 0 })
          : new Response("", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-report-empty.csv"` } });
      }
      match.student = { $in: studentIds };
    }

    const [studentRows, teacherRows] = await Promise.all([
      Attendance.find(match).select("date status classSection student").populate("student", "fullName studentId rollNumber gender class section").lean(),
      TeacherAttendance.find(match).select("date status teacher").populate("teacher", "name").lean(),
    ]);

    if (format === "json") {
      const counts = { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, unmarked: 0 };
      const studentRecords = studentRows.map((row) => {
        const status = row.status as keyof typeof counts;
        if (status in counts) counts[status]++;
        const student = row.student as { fullName?: string; studentId?: string; rollNumber?: string; gender?: string | null; class?: string; section?: string } | null;
        return {
          type: "student",
          studentId: row.student ? String(row.student) : "",
          studentName: student?.fullName ?? "-",
          studentNumber: student?.studentId ?? "-",
          rollNumber: student?.rollNumber ?? "-",
          gender: student?.gender ?? null,
          class: student?.class ?? row.classSection?.split("-")[0] ?? "",
          section: student?.section ?? row.classSection?.split("-")[1] ?? "",
          classSection: row.classSection,
          date: new Date(row.date).toISOString().slice(0, 10),
          status: row.status,
        };
      });
      const teacherRecords = teacherRows.map((row) => {
        const status = row.status as keyof typeof counts;
        if (status in counts) counts[status]++;
        const teacher = row.teacher as { name?: string } | null;
        return {
          type: "teacher",
          teacherId: row.teacher ? String(row.teacher) : "",
          teacherName: teacher?.name ?? "-",
          date: new Date(row.date).toISOString().slice(0, 10),
          status: row.status,
        };
      });
      return NextResponse.json({
        studentRecords,
        teacherRecords,
        counts,
        total: studentRecords.length + teacherRecords.length,
      });
    }

    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
    const csvRows = [
      "Type,Student name,Student ID,Roll number,Gender,Class,Section,Date,Status,Class section",
      ...studentRows.map((row) => {
        const student = row.student as { fullName?: string; studentId?: string; rollNumber?: string; gender?: string | null; class?: string; section?: string } | null;
        return [
          "Student",
          student?.fullName ?? "-",
          student?.studentId ?? "-",
          student?.rollNumber ?? "-",
          student?.gender ?? "",
          student?.class ?? row.classSection?.split("-")[0] ?? "",
          student?.section ?? row.classSection?.split("-")[1] ?? "",
          new Date(row.date).toISOString().slice(0, 10),
          row.status,
          row.classSection,
        ].map(escape).join(",");
      }),
      ...teacherRows.map((row) => {
        const teacher = row.teacher as { name?: string } | null;
        return [
          "Teacher",
          teacher?.name ?? "-",
          "",
          "",
          "",
          "",
          "",
          new Date(row.date).toISOString().slice(0, 10),
          row.status,
          "",
        ].map(escape).join(",");
      }),
    ];

    const dateLabel = month || `${from || "start"}-${to || "end"}`;
    return new Response(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-report-${dateLabel}.csv"`,
      },
    });
  } catch (error) {
    console.error("Attendance report export error:", error);
    return NextResponse.json({ error: "Unable to export attendance report" }, { status: 500 });
  }
}
