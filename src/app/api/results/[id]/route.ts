import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Result, Student, Teacher } from "@/Models";

type SubjectPayload = {
  subject?: unknown;
  totalMarks?: unknown;
  passingMarks?: unknown;
  obtainedMarks?: unknown;
};

async function getAuthorizedResult(id: string) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 as const };
  if (session.user.role !== "teacher" && session.user.role !== "admin") return { error: "Only teachers and administrators can manage results", status: 403 as const };
  await connectToDatabase();
  const result = await Result.findById(id).lean();
  if (!result) return { error: "Result not found", status: 404 as const };
  if (session.user.role === "teacher") {
    const [student, teacher] = await Promise.all([
      Student.findById(result.student).select("class section").lean(),
      Teacher.findOne({ cnic: session.user.cnic }).select("assignedClasses").lean(),
    ]);
    const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).trim().toUpperCase());
    if (!student || !assigned.includes(`${student.class}-${student.section}`.toUpperCase())) {
      return { error: "You are not assigned to this student", status: 403 as const };
    }
  }
  return { session, result };
}

function validateSubject(body: SubjectPayload) {
  const subject = String(body.subject ?? "").trim();
  const totalMarks = Number(body.totalMarks);
  const passingMarks = Number(body.passingMarks);
  const obtainedMarks = Number(body.obtainedMarks);
  if (!subject || ![totalMarks, passingMarks, obtainedMarks].every(Number.isFinite)) return { error: "Subject and every mark are required" };
  if (totalMarks <= 0 || passingMarks < 0 || obtainedMarks < 0 || passingMarks > totalMarks || obtainedMarks > totalMarks) return { error: "Marks must be valid and obtained marks cannot exceed total marks" };
  return { subject, totalMarks, passingMarks, obtainedMarks };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAuthorizedResult((await params).id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    const validated = validateSubject(await request.json());
    if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
    const updated = await Result.findByIdAndUpdate(access.result._id, {
      ...validated,
      percentage: Math.round((validated.obtainedMarks / validated.totalMarks) * 100),
      result: validated.obtainedMarks >= validated.passingMarks ? "pass" : "fail",
    }, { new: true }).populate("examTerm", "title").lean();
    return NextResponse.json({ success: true, result: updated });
  } catch (error) {
    console.error("Result update error:", error);
    return NextResponse.json({ error: "Unable to update result" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAuthorizedResult((await params).id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    await Result.findByIdAndDelete(access.result._id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Result deletion error:", error);
    return NextResponse.json({ error: "Unable to delete result" }, { status: 500 });
  }
}
