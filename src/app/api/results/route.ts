import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ExamTerm, Result, Student, Teacher } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

type SubjectInput = { subject?: unknown; totalMarks?: unknown; passingMarks?: unknown; obtainedMarks?: unknown };

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
      const params = new URL(request.url).searchParams;
      const studentFilter: Record<string, unknown> = {};
      const classSection = params.get("classSection")?.trim().toUpperCase();
      const search = params.get("search")?.trim();
      if (classSection) {
        const [className, section] = classSection.split("-");
        studentFilter.class = className;
        studentFilter.section = section;
      }
      if (search) {
        const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        studentFilter.$or = [{ fullName: { $regex: safeSearch, $options: "i" } }, { studentId: { $regex: safeSearch, $options: "i" } }];
      }
      const matchingStudents = await Student.find(studentFilter).select("_id").lean();
      query = { student: { $in: matchingStudents.map((student) => student._id) } };
    }
    // Paginated callers pass ?page=; legacy callers keep the previous row cap.
    const params = new URL(request.url).searchParams;
    const requestedStudent = params.get("studentId")?.trim();
    const examTerm = params.get("examTerm")?.trim();
    if (examTerm) {
      const term = await ExamTerm.findOne({ school: access.user.school, title: examTerm }).select("_id").lean();
      query.examTerm = term?._id ?? null;
    }
    if (requestedStudent) {
      let allowed = false;
      if (access.user.role === "teacher") {
        const [student, teacher] = await Promise.all([
          Student.findById(requestedStudent).select("class section").lean(),
          Teacher.findOne({ cnic: access.user.cnic }).select("assignedClasses").lean(),
        ]);
        const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).trim().toUpperCase());
        allowed = Boolean(student && assigned.includes(`${student.class}-${student.section}`.toUpperCase()));
      } else {
        allowed = Boolean(await Student.exists({ _id: requestedStudent }));
      }
      if (!allowed) return NextResponse.json({ error: "You are not allowed to view this student's results" }, { status: 403 });
      query = { student: requestedStudent };
    }
    const paginated = params.has("page");
    const limit = paginated ? parsePageSize(params.get("limit"), 20) : 200;
    const total = await Result.countDocuments(query);
    const pages = countPages(total, limit);
    const page = paginated ? clampPage(parsePageNumber(params.get("page")), pages) : 1;
    const results = await Result.find(query).populate("examTerm", "title").populate("student", "fullName studentId class section rollNumber").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
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
    const studentId = String(body.studentId ?? "");
    const title = String(body.examTitle ?? "").trim();
    const submittedSubjects: SubjectInput[] = Array.isArray(body.subjects) ? body.subjects as SubjectInput[] : [{
      subject: body.subject,
      totalMarks: body.totalMarks,
      passingMarks: body.passingMarks,
      obtainedMarks: body.obtainedMarks,
    }];
    const subjects = submittedSubjects.map((item) => ({
      subject: String(item.subject ?? "").trim(),
      totalMarks: Number(item.totalMarks),
      passingMarks: Number(item.passingMarks),
      obtainedMarks: Number(item.obtainedMarks),
    }));
    if (!studentId || !title || subjects.length === 0 || subjects.some((item) => !item.subject || !Number.isFinite(item.totalMarks) || !Number.isFinite(item.passingMarks) || !Number.isFinite(item.obtainedMarks))) {
      return NextResponse.json({ error: "Student, exam title, and every subject mark are required" }, { status: 400 });
    }
    if (subjects.some((item) => item.totalMarks <= 0 || item.passingMarks < 0 || item.obtainedMarks < 0 || item.passingMarks > item.totalMarks || item.obtainedMarks > item.totalMarks)) {
      return NextResponse.json({ error: "Marks must be valid and obtained marks cannot exceed total marks" }, { status: 400 });
    }
    if (new Set(subjects.map((item) => item.subject.toLowerCase())).size !== subjects.length) {
      return NextResponse.json({ error: "Each subject can only be added once for a term" }, { status: 400 });
    }
    await connectToDatabase();
    const student = await Student.findById(studentId).lean();
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (access.user.role === "teacher") { const teacher = await Teacher.findOne({ cnic: access.user.cnic }).lean(); const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item)); if (!assigned.includes(`${student.class}-${student.section}`)) return NextResponse.json({ error: "You are not assigned to this student" }, { status: 403 }); }
    let term = await ExamTerm.findOne({ title, academicYear: "2026-2027" });
    if (!term) term = await ExamTerm.create({ title, academicYear: "2026-2027", school: access.user.school });
    const records = subjects.map((item) => ({
      student: student._id,
      examTerm: term._id,
      ...item,
      percentage: Math.round((item.obtainedMarks / item.totalMarks) * 100),
      result: item.obtainedMarks >= item.passingMarks ? "pass" : "fail",
    }));
    const results = await Result.insertMany(records);
    return NextResponse.json({ success: true, results, count: results.length }, { status: 201 });
  } catch (error) {
    console.error("Result creation error:", error);
    return NextResponse.json({ error: "Unable to create result" }, { status: 500 });
  }
}
