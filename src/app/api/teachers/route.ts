import { NextResponse } from "next/server";
import { DEFAULT_TEACHER_PASSWORD, getCurrentUser, normalizeCNIC, hashPassword } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Teacher, User } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

async function adminAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "admin") return { error: "Administrator access required", status: 403 };
  return { user: session.user };
}

/**
 * Reads a date coming from `<input type="date">` (`YYYY-MM-DD`).
 *
 * Blank means "no date" and yields `undefined`; anything unparseable yields
 * `false` so the caller can answer 400 instead of silently storing garbage.
 */
function readDate(value: unknown): Date | false | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? false : parsed;
}

export async function GET(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    // Paginated callers pass ?page=; the assign-classes dropdown (no ?page=)
    // keeps the previous "up to 100 rows" behaviour.
    const params = new URL(request.url).searchParams;
    const paginated = params.has("page");
    const limit = paginated ? parsePageSize(params.get("limit"), 20) : 100;
    const total = await Teacher.countDocuments();
    const pages = countPages(total, limit);
    const page = paginated ? clampPage(parsePageNumber(params.get("page")), pages) : 1;
    const teachers = await Teacher.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return NextResponse.json({ teachers, pagination: { page, pages, total, limit } });
  } catch (error) {
    console.error("Teacher list error:", error);
    return NextResponse.json({ error: "Unable to load teachers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const cnic = normalizeCNIC(String(body.cnic ?? "").trim());
    const gender = String(body.gender ?? "").trim();
    const password = DEFAULT_TEACHER_PASSWORD;
    if (!name || !email || !/^\d{5}-\d{7}-\d$/.test(cnic) || !["male", "female", "other"].includes(gender)) return NextResponse.json({ error: "Name, email, valid CNIC, and gender are required" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    // Monthly salary drives the salary tab; 0 is allowed for a not-yet-decided salary.
    const salary = Number(body.salary);
    if (!Number.isFinite(salary) || salary < 0) return NextResponse.json({ error: "Salary cannot be negative" }, { status: 400 });
    const dateOfBirth = readDate(body.dateOfBirth);
    const dateOfJoining = readDate(body.dateOfJoining);
    if (dateOfBirth === false || dateOfJoining === false) return NextResponse.json({ error: "Date of birth and date of joining must be valid dates" }, { status: 400 });
    await connectToDatabase();
    const duplicate = await User.findOne({ $or: [{ email }, { cnic }] }).lean();
    if (duplicate) return NextResponse.json({ error: "An account with this email or CNIC already exists" }, { status: 409 });
    const teacher = await Teacher.create({ name, cnic, phone: body.phone, subject: body.subject, gender, salary, dateOfBirth, dateOfJoining, assignedClasses: [], assignedSections: [] });
    await User.create({ name, email, cnic, role: "teacher", password: await hashPassword(password), isActive: true, school: access.user.school });
    return NextResponse.json({ success: true, teacher: { id: teacher._id, name: teacher.name } }, { status: 201 });
  } catch (error) {
    console.error("Teacher creation error:", error);
    return NextResponse.json({ error: "Unable to create teacher" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const teacherId = String(body.teacherId ?? "");
    const action = String(body.action ?? "assign");
    if (action === "update") {
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const cnic = normalizeCNIC(String(body.cnic ?? "").trim());
      const phone = String(body.phone ?? "").trim();
      const subject = String(body.subject ?? "").trim();
      const gender = String(body.gender ?? "").trim();
      const accountStatus = String(body.accountStatus ?? "active");
      const salary = Number(body.salary);
      if (!teacherId || !name || !email || !/^\d{5}-\d{7}-\d$/.test(cnic) || !["male", "female", "other"].includes(gender) || !["active", "inactive", "pending"].includes(accountStatus)) return NextResponse.json({ error: "Teacher, name, email, valid CNIC, gender, and valid status are required" }, { status: 400 });
      if (!Number.isFinite(salary) || salary < 0) return NextResponse.json({ error: "Salary cannot be negative" }, { status: 400 });
      const dateOfBirth = readDate(body.dateOfBirth);
      const dateOfJoining = readDate(body.dateOfJoining);
      if (dateOfBirth === false || dateOfJoining === false) return NextResponse.json({ error: "Date of birth and date of joining must be valid dates" }, { status: 400 });
      await connectToDatabase();
      const teacher = await Teacher.findById(teacherId);
      if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
      const user = await User.findOne({ role: "teacher", cnic: teacher.cnic });
      const duplicate = await User.findOne({ $or: [{ email }, { cnic }], _id: { $ne: user?._id } }).lean();
      if (duplicate) return NextResponse.json({ error: "Another account already uses this email or CNIC" }, { status: 409 });
      teacher.name = name; teacher.cnic = cnic; teacher.phone = phone; teacher.subject = subject; teacher.gender = gender; teacher.accountStatus = accountStatus; teacher.salary = salary;
      // Absent keys leave the stored dates alone; a blank value clears them.
      if (Object.prototype.hasOwnProperty.call(body, "dateOfBirth")) teacher.dateOfBirth = dateOfBirth ?? null;
      if (Object.prototype.hasOwnProperty.call(body, "dateOfJoining")) teacher.dateOfJoining = dateOfJoining ?? null;
      await teacher.save();
      if (user) {
        user.name = name; user.email = email; user.cnic = cnic; user.isActive = accountStatus === "active";
        user.password = await hashPassword(DEFAULT_TEACHER_PASSWORD);
        await user.save();
      }
      return NextResponse.json({ success: true, teacher });
    }
    const assignments = Array.isArray(body.assignments) ? body.assignments.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean) : [];
    if (!teacherId) return NextResponse.json({ error: "Teacher is required" }, { status: 400 });
    await connectToDatabase();
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    const classes = await ClassSection.find({ isActive: true }).lean();
    const valid = new Set(classes.map((item) => `${item.className}-${item.sectionName}`.toUpperCase()));
    if (assignments.some((item: string) => !valid.has(item))) return NextResponse.json({ error: "One or more class assignments do not exist" }, { status: 400 });
    teacher.assignedClasses = assignments;
    teacher.assignedSections = assignments.map((item: string) => item.split("-").slice(1).join("-"));
    await teacher.save();
    await ClassSection.updateMany({ teacherId: teacher._id }, { $unset: { teacherId: 1 } });
    for (const assignment of assignments) {
      const [className, ...sectionParts] = assignment.split("-");
      await ClassSection.updateOne({ className, sectionName: sectionParts.join("-").toUpperCase() }, { $set: { teacherId: teacher._id } });
    }
    return NextResponse.json({ success: true, teacher });
  } catch (error) {
    console.error("Teacher assignment error:", error);
    return NextResponse.json({ error: "Unable to assign teacher" }, { status: 500 });
  }
}
