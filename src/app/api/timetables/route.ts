import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Student, Teacher, Timetable } from "@/Models";

const days = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);

async function access() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  return { user: session.user };
}

export async function GET(request: Request) {
  const result = await access();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const academicYear = params.get("academicYear")?.trim() || "2026-2027";
    let scope = params.get("scope")?.trim() as "class" | "teacher" | null;
    let target = params.get("target")?.trim() || "";
    if (result.user.role === "student") {
      const student = await Student.findOne({ cnic: result.user.cnic }).select("class section").lean();
      scope = "class";
      target = student ? `${student.class}-${student.section}`.toUpperCase() : "";
    } else if (result.user.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: result.user.cnic }).select("_id").lean();
      if (scope === "class") {
        const assignedClasses = await Teacher.findOne({ cnic: result.user.cnic }).select("assignedClasses").lean();
        const assigned = (assignedClasses?.assignedClasses ?? []).map((item: unknown) => String(item).trim().toUpperCase());
        target = target.toUpperCase();
        if (!assigned.includes(target)) return NextResponse.json({ error: "You can only view timetables for your assigned classes" }, { status: 403 });
      } else {
        scope = "teacher";
        target = teacher ? String(teacher._id) : "";
      }
    }
    if (!scope || !target || !["class", "teacher"].includes(scope)) return NextResponse.json({ error: "Timetable scope and target are required" }, { status: 400 });
    const timetable = await Timetable.findOne({ scope, target, academicYear }).lean();
    const teachers = scope === "class"
      ? await Teacher.find({}).select("_id name accountStatus assignedClasses").sort({ name: 1 }).lean()
      : [];
    const teacherBusy: Record<string, string[]> = {};
    if (scope === "class") {
      const teacherTimetables = await Timetable.find({ scope: "teacher", academicYear }).select("target entries").lean();
      for (const row of teacherTimetables) {
        teacherBusy[String(row.target)] = (row.entries ?? []).map((entry: { day: string; period: number }) => `${entry.day}:${entry.period}`);
      }
    }
    return NextResponse.json({ timetable: timetable ?? { scope, target, academicYear, classSection: "", entries: [] }, teachers, teacherBusy });
  } catch (error) {
    console.error("Timetable load error:", error);
    return NextResponse.json({ error: "Unable to load timetable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await access();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.user.role !== "admin") return NextResponse.json({ error: "Only administrators can edit timetables" }, { status: 403 });
  try {
    const body = await request.json();
    const scope = String(body.scope ?? "").trim();
    const target = String(body.target ?? "").trim();
    const classSection = target.toUpperCase();
    const academicYear = String(body.academicYear ?? "2026-2027").trim();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!["class", "teacher"].includes(scope) || !target || !academicYear) return NextResponse.json({ error: "Timetable scope, target, and academic year are required" }, { status: 400 });
    await connectToDatabase();
    if (scope === "class") {
      const classSection = target.toUpperCase();
      const [className, section] = classSection.split("-");
      const exists = await ClassSection.findOne({ className, sectionName: section, isActive: true }).lean();
      if (!exists) return NextResponse.json({ error: "Class and section not found" }, { status: 404 });
    } else {
      if (!await Teacher.exists({ _id: target })) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }
    const normalized = entries.map((entry: Record<string, unknown>) => ({
      day: String(entry.day ?? "").toLowerCase(),
      period: Number(entry.period),
      subject: String(entry.subject ?? "").trim(),
      room: "",
      teacher: String(entry.teacher ?? "").trim(),
      teacherId: String(entry.teacherId ?? "").trim(),
      classSection: String(entry.classSection ?? "").trim().toUpperCase(),
    })).filter((entry: { day: string; period: number; subject: string }) => days.has(entry.day) && Number.isInteger(entry.period) && entry.period > 0 && entry.period <= 8 && entry.subject);
    const occupied = new Set<string>();
    for (const entry of normalized) {
      const key = `${entry.day}:${entry.period}`;
      if (occupied.has(key)) return NextResponse.json({ error: `Period ${entry.period} is repeated on ${entry.day}` }, { status: 400 });
      occupied.add(key);
    }
    const previous = scope === "class"
      ? await Timetable.findOne({ scope, target, academicYear }).select("entries").lean()
      : null;
    if (scope === "class") {
      const teacherIds = new Set(normalized.map((entry: { teacherId: string }) => entry.teacherId).filter(Boolean));
      const previousTeacherIds = new Set((previous?.entries ?? []).map((entry: { teacherId?: string }) => entry.teacherId).filter(Boolean) as string[]);
      const affected = new Set([...teacherIds, ...previousTeacherIds]);
      for (const teacherId of affected) {
        const teacherTimetable = await Timetable.findOne({ scope: "teacher", target: teacherId, academicYear }).select("entries").lean();
        const occupiedByOtherClass = (teacherTimetable?.entries ?? []).filter((entry: { classSection?: string }) => entry.classSection !== classSection);
        for (const entry of normalized.filter((item: { teacherId: string }) => item.teacherId === teacherId)) {
          if (occupiedByOtherClass.some((item: { day: string; period: number }) => item.day === entry.day && item.period === entry.period)) {
            return NextResponse.json({ error: `This teacher is already assigned to another class on ${entry.day}, period ${entry.period}` }, { status: 409 });
          }
        }
      }
    }
    const saved = await Timetable.findOneAndUpdate({ scope, target, academicYear }, { scope, target, academicYear, classSection: scope === "class" ? target.toUpperCase() : "", entries: normalized, updatedBy: result.user.id }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    if (scope === "class") {
      const affected = new Set([
        ...(previous?.entries ?? []).map((entry: { teacherId?: string }) => entry.teacherId).filter(Boolean),
        ...normalized.map((entry: { teacherId: string }) => entry.teacherId).filter(Boolean),
      ] as string[]);
      for (const teacherId of affected) {
        const current = await Timetable.findOne({ scope: "teacher", target: teacherId, academicYear }).lean();
        const retained = (current?.entries ?? []).filter((entry: { classSection?: string }) => entry.classSection !== classSection);
        const additions = normalized.filter((entry: { teacherId: string }) => entry.teacherId === teacherId).map((entry: { teacherId: string; teacher: string; day: string; period: number; subject: string; room: string; classSection: string }) => ({
          ...entry,
          teacher: entry.teacher,
          classSection,
        }));
        await Timetable.findOneAndUpdate(
          { scope: "teacher", target: teacherId, academicYear },
          { scope: "teacher", target: teacherId, academicYear, classSection: "", entries: [...retained, ...additions], updatedBy: result.user.id },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      }
    }
    return NextResponse.json({ success: true, timetable: saved });
  } catch (error) {
    console.error("Timetable save error:", error);
    return NextResponse.json({ error: "Unable to save timetable" }, { status: 500 });
  }
}
