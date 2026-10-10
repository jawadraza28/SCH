import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, ClassSection, Fee, Result, Student } from "@/Models";

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    const body = await request.json();
    const ids = Array.isArray(body.studentIds) ? body.studentIds.map(String).filter(Boolean) : [];
    const targetClass = String(body.targetClass ?? "").trim();
    const targetSection = String(body.targetSection ?? "").trim().toUpperCase();
    const confirmOldRecords = body.confirmOldRecords === true;
    if (!ids.length || !targetClass || !targetSection || !confirmOldRecords) return NextResponse.json({ error: "Select students, a destination class, and confirm removal of old attendance, fee, and result records." }, { status: 400 });
    await connectToDatabase();
    const target = await ClassSection.findOne({ className: targetClass, sectionName: targetSection, isActive: true }).select("academicYear capacity").lean();
    if (!target) return NextResponse.json({ error: "Destination class section is not configured." }, { status: 400 });
    const students = await Student.find({ _id: { $in: ids }, accountStatus: { $in: ["active", "pending"] } }).select("_id class section academicYear").lean();
    if (students.length !== ids.length) return NextResponse.json({ error: "One or more selected students could not be found." }, { status: 404 });
    const destinationCount = await Student.countDocuments({ class: targetClass, section: targetSection, accountStatus: { $in: ["active", "pending"] }, _id: { $nin: ids } });
    if (destinationCount + students.length > Number(target.capacity ?? 0)) return NextResponse.json({ error: `The destination section only has ${Math.max(0, Number(target.capacity ?? 0) - destinationCount)} available seats.` }, { status: 409 });
    const studentIds = students.map((student) => student._id);
    const oldYears = [...new Set(students.map((student) => String(student.academicYear || "")).filter(Boolean))];
    const oldSession = oldYears.length ? { $or: [{ academicYear: { $in: oldYears } }, { academicYear: { $exists: false } }, { academicYear: "" }] } : { $or: [{ academicYear: { $exists: false } }, { academicYear: "" }] };
    const [attendance, fees, results] = await Promise.all([
      Attendance.deleteMany({ student: { $in: studentIds }, ...oldSession }),
      Fee.deleteMany({ student: { $in: studentIds }, ...oldSession }),
      Result.deleteMany({ student: { $in: studentIds } }),
    ]);
    await Student.updateMany({ _id: { $in: studentIds } }, { $set: { class: targetClass, section: targetSection, currentClass: targetClass, currentSection: targetSection, academicYear: target.academicYear } });
    return NextResponse.json({ success: true, promoted: students.length, removed: { attendance: attendance.deletedCount, fees: fees.deletedCount, results: results.deletedCount }, academicYear: target.academicYear });
  } catch (error) {
    console.error("Student promotion error:", error);
    return NextResponse.json({ error: "Unable to promote students" }, { status: 500 });
  }
}
