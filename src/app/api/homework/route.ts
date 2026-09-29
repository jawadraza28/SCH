import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Homework, Student, Teacher } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

async function sessionAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  return { user: session.user };
}

export async function GET(request: Request) {
  const access = await sessionAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const limit = parsePageSize(params.get("limit"), 20);
    let query: Record<string, unknown>;
    if (access.user.role === "student") {
      const student = await Student.findOne({ cnic: access.user.cnic }).lean();
      if (!student) return NextResponse.json({ homework: [], pagination: { page: 1, pages: 1, total: 0, limit } });
      query = { assignedToClass: student.class, assignedToSection: student.section, isActive: true };
    } else if (access.user.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: access.user.cnic }).lean();
      if (!teacher) return NextResponse.json({ homework: [], pagination: { page: 1, pages: 1, total: 0, limit } });
      query = { assignedBy: teacher._id, isActive: true };
    } else {
      query = { isActive: true };
    }
    const total = await Homework.countDocuments(query);
    const pages = countPages(total, limit);
    const page = clampPage(parsePageNumber(params.get("page")), pages);
    const homework = await Homework.find(query).sort({ dueDate: 1 }).skip((page - 1) * limit).limit(limit).lean();
    return NextResponse.json({ homework, pagination: { page, pages, total, limit } });
  } catch (error) {
    console.error("Homework load error:", error);
    return NextResponse.json({ error: "Unable to load homework" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await sessionAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.user.role !== "teacher") return NextResponse.json({ error: "Only teachers can create homework" }, { status: 403 });
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim(); const subject = String(body.subject ?? "").trim(); const description = String(body.description ?? "").trim(); const assignedToClass = String(body.className ?? "").trim(); const assignedToSection = String(body.section ?? "").trim().toUpperCase(); const dueDate = String(body.dueDate ?? "").trim();
    if (!title || !subject || !description || !assignedToClass || !assignedToSection || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return NextResponse.json({ error: "Subject, class, section, title, description, and due date are required" }, { status: 400 });
    await connectToDatabase();
    const teacher = await Teacher.findOne({ cnic: access.user.cnic }).lean();
    if (!teacher) return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
    const assigned = (teacher.assignedClasses ?? []).map((item: unknown) => String(item));
    if (!assigned.includes(`${assignedToClass}-${assignedToSection}`)) return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
    const homework = await Homework.create({ title, description, subject, classSection: `${assignedToClass}-${assignedToSection}`, assignedBy: teacher._id, assignedToClass, assignedToSection, dueDate: new Date(`${dueDate}T23:59:59.999Z`) });
    return NextResponse.json({ success: true, homework }, { status: 201 });
  } catch (error) {
    console.error("Homework creation error:", error);
    return NextResponse.json({ error: "Unable to create homework" }, { status: 500 });
  }
}
