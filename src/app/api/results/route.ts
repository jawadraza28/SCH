import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ExamTerm, Result, Student, Teacher } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

async function getAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  return { user: session.user };
}

export async function GET(request: Request) {
  const access = await getAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    let query: Record<string, unknown>;
    if (access.user.role === "student") {
      const student = await Student.findOne({ cnic: access.user.cnic }).lean();
      if (!student) return NextResponse.json({ results: [], pagination: { page: 1, pages: 1, total: 0, limit: 200 } });
      query = { student: student._id };
    } else if (access.user.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: access.user.cnic }).lean();
      const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item));
      const students = assigned.length ? await Student.find({ $expr: { $in: [{ $concat: ["$class", "-", "$section"] }, assigned] } }).select("_id").lean() : [];
      query = { student: { $in: students.map((student) => student._id) } };
    } else {
      query = {};
    }
    // Paginated callers pass ?page=; legacy callers keep the previous row cap.
    const params = new URL(request.url).searchParams;
    const paginated = params.has("page");
    const limit = paginated ? parsePageSize(params.get("limit"), 20) : 200;
    const total = await Result.countDocuments(query);
    const pages = countPages(total, limit);
    const page = paginated ? clampPage(parsePageNumber(params.get("page")), pages) : 1;
    const results = await Result.find(query).populate("examTerm", "title").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return NextResponse.json({ results, pagination: { page, pages, total, limit } });
  } catch (error) {
    console.error("Result load error:", error);
    return NextResponse.json({ error: "Unable to load results" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await getAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.user.role !== "teacher" && access.user.role !== "admin") return NextResponse.json({ error: "Only teachers and administrators can create results" }, { status: 403 });
  try {
    const body = await request.json();
    const studentId = String(body.studentId ?? ""); const title = String(body.examTitle ?? "").trim(); const subject = String(body.subject ?? "").trim(); const totalMarks = Number(body.totalMarks); const passingMarks = Number(body.passingMarks); const obtainedMarks = Number(body.obtainedMarks);
    if (!studentId || !title || !subject || !Number.isFinite(totalMarks) || !Number.isFinite(passingMarks) || !Number.isFinite(obtainedMarks)) return NextResponse.json({ error: "Student, exam title, subject, and marks are required" }, { status: 400 });
    if (totalMarks <= 0 || passingMarks < 0 || obtainedMarks < 0 || passingMarks > totalMarks || obtainedMarks > totalMarks) return NextResponse.json({ error: "Marks must be valid and cannot exceed total marks" }, { status: 400 });
    await connectToDatabase();
    const student = await Student.findById(studentId).lean();
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (access.user.role === "teacher") { const teacher = await Teacher.findOne({ cnic: access.user.cnic }).lean(); const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item)); if (!assigned.includes(`${student.class}-${student.section}`)) return NextResponse.json({ error: "You are not assigned to this student" }, { status: 403 }); }
    let term = await ExamTerm.findOne({ title, academicYear: "2026-2027" });
    if (!term) term = await ExamTerm.create({ title, academicYear: "2026-2027", school: access.user.school });
    const result = await Result.create({ student: student._id, examTerm: term._id, subject, totalMarks, passingMarks, obtainedMarks });
    return NextResponse.json({ success: true, result }, { status: 201 });
  } catch (error) {
    console.error("Result creation error:", error);
    return NextResponse.json({ error: "Unable to create result" }, { status: 500 });
  }
}
