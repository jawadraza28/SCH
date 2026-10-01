import { NextResponse } from "next/server";
import { DEFAULT_STUDENT_PASSWORD, getCurrentUser, normalizeCNIC, hashPassword } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student, Teacher } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

const cnicPattern = /^\d{5}-\d{7}-\d$/;

async function requireAdmin() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "admin") return { error: "Only administrators can manage students", status: 403 };
  return { user: session.user };
}

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "teacher") return NextResponse.json({ error: "Access denied" }, { status: 403 });

  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim() ?? "";
    const status = params.get("status")?.trim() ?? "";
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const conditions: Record<string, unknown>[] = [];
    if (["active", "pending", "rejected", "suspended"].includes(status)) conditions.push({ accountStatus: status });
    if (safeSearch) {
      conditions.push({ $or: [{ fullName: { $regex: safeSearch, $options: "i" } }, { studentId: { $regex: safeSearch, $options: "i" } }, { cnic: { $regex: safeSearch, $options: "i" } }, { rollNumber: { $regex: safeSearch, $options: "i" } }] });
    }
    if (session.user.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
      const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).trim().toUpperCase());
      if (!assigned.length) return NextResponse.json({ students: [], assignedClasses: assigned, pagination: { page: 1, pages: 1, total: 0, limit: 200 } });
      conditions.push({ $expr: { $in: [{ $toUpper: { $concat: [{ $ifNull: ["$class", ""] }, "-", { $ifNull: ["$section", ""] }] } }, assigned] } });
    }
    const query = conditions.length ? { $and: conditions } : {};
    // Callers with ?page= get one small page (fast on big schools); callers
    // without it keep the previous "up to 200 rows" behaviour (form dropdowns).
    const paginated = params.has("page");
    const limit = paginated ? parsePageSize(params.get("limit"), 10) : 200;
    const total = await Student.countDocuments(query);
    const pages = countPages(total, limit);
    const page = paginated ? clampPage(parsePageNumber(params.get("page")), pages) : 1;
    const students = await Student.find(query).sort({ class: 1, section: 1, rollNumber: 1 }).skip((page - 1) * limit).limit(limit).lean();
    return NextResponse.json({ students, pagination: { page, pages, total, limit } });
  } catch (error) {
    console.error("Student list error:", error);
    return NextResponse.json({ error: "Unable to load students" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "teacher") return NextResponse.json({ error: "Only teachers can submit student requests" }, { status: 403 });

  try {
    const body = await request.json();
    const { fullName, cnic, dateOfBirth, gender, className, section, rollNumber, fatherName, fatherPhone, homeAddress } = body;
    const normalizedCNIC = normalizeCNIC(String(cnic ?? ""));
    const missingFields = [
      !String(fullName ?? "").trim() ? "full name" : "",
      !String(cnic ?? "").trim() ? "CNIC" : "",
      !String(className ?? "").trim() ? "class" : "",
      !String(section ?? "").trim() ? "section" : "",
      !String(rollNumber ?? "").trim() ? "roll number" : "",
      !String(gender ?? "").trim() ? "gender" : "",
    ].filter(Boolean);
    if (missingFields.length) return NextResponse.json({ error: `Please complete: ${missingFields.join(", ")}.` }, { status: 400 });
    if (!cnicPattern.test(normalizedCNIC)) return NextResponse.json({ error: "CNIC is invalid. Use 42101-1234567-1 or 13 digits without separators." }, { status: 400 });

    await connectToDatabase();

    if (session.user.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
      const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).toUpperCase());
      if (!assigned.includes(`${String(className).trim()}-${String(section).trim().toUpperCase()}`)) return NextResponse.json({ error: "You can only add students to your assigned classes" }, { status: 403 });
    }

    const normalizedClass = String(className).trim();
    const normalizedSection = String(section).trim().toUpperCase();
    const normalizedRoll = String(rollNumber).trim();

    const existingCnic = await Student.findOne({ cnic: normalizedCNIC }).select("_id").lean();
    if (existingCnic) return NextResponse.json({ error: "A student with this CNIC already exists" }, { status: 409 });
    const existingRoll = await Student.findOne({ class: normalizedClass, section: normalizedSection, rollNumber: normalizedRoll }).select("_id").lean();
    if (existingRoll) return NextResponse.json({ error: `Roll number ${normalizedRoll} is already used in class ${normalizedClass}-${normalizedSection}. Choose a different roll number.` }, { status: 409 });

    const count = await Student.countDocuments();
    const student = await Student.create({
      studentId: `STU-${String(count + 1).padStart(6, "0")}`,
      fullName: String(fullName).trim(), cnic: normalizedCNIC, dateOfBirth: dateOfBirth || undefined,
      gender: gender || undefined, class: normalizedClass, section: normalizedSection,
      rollNumber: normalizedRoll, fatherName, fatherPhone, homeAddress, accountStatus: "pending",
    });
    return NextResponse.json({ success: true, student: { id: student._id, studentId: student.studentId, fullName: student.fullName } }, { status: 201 });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "Another student already uses this CNIC or this roll number in the same class." }, { status: 409 });
    }
    console.error("Student creation error:", error);
    return NextResponse.json({ error: "Unable to create student" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdmin();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const studentId = String(body.studentId ?? "");
    const action = String(body.action ?? "");
    if (!studentId || !["approve", "reject", "activate", "deactivate"].includes(action)) return NextResponse.json({ error: "Student and valid action are required" }, { status: 400 });
    await connectToDatabase();
    const student = await Student.findById(studentId);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (action === "reject") { student.accountStatus = "rejected"; await student.save(); return NextResponse.json({ success: true, status: student.accountStatus }); }
    if (action === "deactivate") { student.accountStatus = "suspended"; await student.save(); return NextResponse.json({ success: true, status: student.accountStatus }); }
    student.accountStatus = "active";
    await student.save();
    const existingUser = await (await import("@/Models")).User.findOne({ cnic: student.cnic });
    if (!existingUser) {
      await (await import("@/Models")).User.create({ name: student.fullName, email: `${student.studentId.toLowerCase()}@student.local`, cnic: student.cnic, role: "student", password: await hashPassword(DEFAULT_STUDENT_PASSWORD), firstLoginCompleted: true, isActive: true, school: access.user.school });
    } else { existingUser.password = await hashPassword(DEFAULT_STUDENT_PASSWORD); existingUser.firstLoginCompleted = true; existingUser.isActive = true; await existingUser.save(); }
    return NextResponse.json({ success: true, status: student.accountStatus, defaultPassword: DEFAULT_STUDENT_PASSWORD });
  } catch (error) { console.error("Student approval error:", error); return NextResponse.json({ error: "Unable to update student status" }, { status: 500 }); }
}
