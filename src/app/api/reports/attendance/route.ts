import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, TeacherAttendance } from "@/Models";

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from")?.trim() ?? "";
  const to = params.get("to")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "Valid from and to dates are required" }, { status: 400 });
  try {
    await connectToDatabase();
    const range = { date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) } };
    const [students, teachers] = await Promise.all([Attendance.find(range).select("date status classSection student").lean(), TeacherAttendance.find(range).select("date status teacher").lean()]);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
    const rows = ["Type,Record ID,Date,Status,Class section", ...students.map((row) => ["Student", row.student, new Date(row.date).toISOString().slice(0, 10), row.status, row.classSection]), ...teachers.map((row) => ["Teacher", row.teacher, new Date(row.date).toISOString().slice(0, 10), row.status, ""]).map((row) => row.map(escape).join(","))].map((row) => Array.isArray(row) ? row.map(escape).join(",") : row);
    return new Response(rows.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-report-${from}-${to}.csv"` } });
  } catch (error) {
    console.error("Attendance report export error:", error);
    return NextResponse.json({ error: "Unable to export attendance report" }, { status: 500 });
  }
}
