import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { AuditLog } from "@/Models";
import { pruneAttendance } from "@/lib/retention";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authorization !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const deleted = await pruneAttendance();
    await AuditLog.create({ action: "attendance_cleanup", targetType: "Attendance", details: `Deleted ${deleted} attendance records older than twelve months` });
    return NextResponse.json({ success: true, deleted });
  } catch (error) { console.error("Attendance cleanup error:", error); return NextResponse.json({ error: "Unable to clean attendance" }, { status: 500 }); }
}
