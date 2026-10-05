import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student, StudentBehavior, Teacher } from "@/Models";

async function canAccessStudent(id: string) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user || session.user.role !== "teacher") return null;
  await connectToDatabase();
  const student = await Student.findById(id).lean();
  if (!student) return null;
  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
  const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).toUpperCase());
  const classSection = `${student.class}-${student.section}`.toUpperCase();
  if (!assigned.includes(classSection)) return null;
  return { session: session.user, student, teacher };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await canAccessStudent((await context.params).id);
    if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const records = await StudentBehavior.find({ student: access.student._id }).sort({ observedAt: -1 }).limit(10).populate("teacher", "name").lean();
    return NextResponse.json({ records });
  } catch (error) {
    console.error("Behavior fetch error:", error);
    return NextResponse.json({ error: "Unable to load behavior" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await canAccessStudent((await context.params).id);
    if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = await request.json();
    const rating = String(body.rating ?? "improving");
    const note = String(body.note ?? "").trim();
    if (!['excellent', 'improving', 'needs_attention'].includes(rating)) {
      return NextResponse.json({ error: "Invalid behavior rating." }, { status: 400 });
    }

    const teacher = await Teacher.findOne({ cnic: access.session.cnic }).select("_id name").lean();
    const record = await StudentBehavior.create({
      student: access.student._id,
      teacher: teacher?._id,
      school: access.session.school,
      rating,
      note,
      observedAt: new Date(),
    });

    const savedRecord = {
      _id: String(record._id),
      rating: record.rating,
      note: record.note,
      observedAt: record.observedAt,
      teacherName: teacher?.name ?? "Teacher",
    };

    return NextResponse.json({ success: true, record: savedRecord });
  } catch (error) {
    console.error("Behavior save error:", error);
    return NextResponse.json({ error: "Unable to save behavior" }, { status: 500 });
  }
}
