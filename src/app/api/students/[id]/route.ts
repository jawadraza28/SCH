import { NextResponse } from "next/server";
import { getCurrentUser, normalizeCNIC } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Student, Teacher, User } from "@/Models";
import { Attendance, Fee, Result } from "@/Models";
import { deleteFromR2 } from "@/lib/object-storage";
import { deleteCloudinaryPhoto } from "@/lib/cloudinary";
import { fullClassMessage, seatAvailability } from "@/lib/seats";

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

async function canAccessStudent(id: string) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user || !["admin", "teacher"].includes(session.user.role)) return null;
  await connectToDatabase();
  const student = await Student.findById(id);
  if (!student) return { session: session.user, student: null };
  if (session.user.role === "admin") return { session: session.user, student };
  const teacher = await Teacher.findOne({ cnic: session.user.cnic }).lean();
  const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).toUpperCase());
  const classSection = `${student.class}-${student.section}`.toUpperCase();
  return assigned.includes(classSection) ? { session: session.user, student } : null;
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await canAccessStudent((await context.params).id);
    if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!access.student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const student = access.student;
    await Promise.all([
      Attendance.deleteMany({ student: student._id }),
      Fee.deleteMany({ student: student._id }),
      Result.deleteMany({ student: student._id }),
      User.deleteMany({ role: "student", cnic: student.cnic }),
    ]);
    if (student.profilePhotoUrl?.startsWith("r2://")) {
      await deleteFromR2(student.profilePhotoUrl).catch((error) => console.warn("Student photo cleanup failed:", error));
    }
    if (student.profilePhotoPublicId) await deleteCloudinaryPhoto(student.profilePhotoPublicId).catch((error) => console.warn("Student Cloudinary photo cleanup failed:", error));
    await Student.deleteOne({ _id: student._id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Student deletion error:", error);
    return NextResponse.json({ error: "Unable to delete student and related records" }, { status: 500 });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await canAccessStudent((await context.params).id);
    if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!access.student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const student = access.student.toObject();
    return NextResponse.json({ student });
  } catch (error) {
    console.error("Student detail error:", error);
    return NextResponse.json({ error: "Unable to load student" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const id = (await context.params).id;
    const fullName = String(body.fullName ?? "").trim();
    const cnic = normalizeCNIC(String(body.cnic ?? "").trim());
    const className = String(body.className ?? "").trim();
    const section = String(body.section ?? "").trim().toUpperCase();
    const rollNumber = String(body.rollNumber ?? "").trim();
    const gender = String(body.gender ?? "").trim();
    if (!fullName || !/^\d{5}-\d{7}-\d$/.test(cnic) || !className || !section || !rollNumber || !["male", "female", "other"].includes(gender)) return NextResponse.json({ error: "Full name, valid CNIC, class, section, roll number, and gender are required" }, { status: 400 });
    const access = await canAccessStudent(id);
    if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!access.student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (access.session.role === "teacher") {
      const teacher = await Teacher.findOne({ cnic: access.session.cnic }).lean();
      const assigned = (teacher?.assignedClasses ?? []).map((item: unknown) => String(item).toUpperCase());
      if (!assigned.includes(`${className}-${section}`.toUpperCase())) return NextResponse.json({ error: "You can only move students within your assigned classes" }, { status: 403 });
    }

    const student = access.student;
    const destinationSection = await ClassSection.findOne({ className, sectionName: section, isActive: true }).select("academicYear").lean();
    if (!destinationSection) return NextResponse.json({ error: "The selected class section has no active academic session." }, { status: 400 });
    const duplicateCnic = await Student.findOne({ _id: { $ne: id }, cnic }).select("_id").lean();
    if (duplicateCnic) return NextResponse.json({ error: "Another student already uses this CNIC" }, { status: 409 });
    const duplicateRoll = await Student.findOne({ _id: { $ne: id }, class: className, section, rollNumber }).select("_id").lean();
    if (duplicateRoll) return NextResponse.json({ error: `Roll number ${rollNumber} is already used in class ${className}-${section}.` }, { status: 409 });
    // Moving a student into a different class must respect that class's seats.
    const movingClass = `${access.student.class}-${access.student.section}`.toUpperCase() !== `${className}-${section}`.toUpperCase();
    if (movingClass) {
      const seats = await seatAvailability(className, section, id);
      if (seats.full) return NextResponse.json({ error: fullClassMessage(className, section, seats) }, { status: 409 });
    }

    const dateOfBirth = readDate(body.dateOfBirth);
    const admissionDate = readDate(body.admissionDate);
    if (dateOfBirth === false || admissionDate === false) return NextResponse.json({ error: "Date of birth and admission date must be valid dates" }, { status: 400 });

    const previousCNIC = student.cnic;
    const optionalText = (value: unknown) => {
      const text = String(value ?? "").trim();
      return text || undefined;
    };
    const optionalCnic = (value: unknown) => {
      const text = normalizeCNIC(String(value ?? "").trim());
      return text || undefined;
    };
    student.fullName = fullName; student.cnic = cnic; student.class = className; student.section = section; student.rollNumber = rollNumber; student.gender = gender; student.academicYear = destinationSection.academicYear;
    student.fatherName = optionalText(body.fatherName); student.fatherCNIC = optionalCnic(body.fatherCNIC); student.fatherOccupation = optionalText(body.fatherOccupation); student.fatherPhone = optionalText(body.fatherPhone); student.motherName = optionalText(body.motherName); student.motherCNIC = optionalCnic(body.motherCNIC); student.motherOccupation = optionalText(body.motherOccupation); student.motherPhone = optionalText(body.motherPhone); student.emergencyContact = optionalText(body.emergencyContact); student.homeAddress = optionalText(body.homeAddress);
    // Absent keys leave the stored dates alone; a blank value clears them.
    if (Object.prototype.hasOwnProperty.call(body, "dateOfBirth")) student.dateOfBirth = dateOfBirth ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "admissionDate")) student.admissionDate = admissionDate ?? null;
    await student.save();
    const user = await User.findOne({ role: "student", $or: [{ cnic: previousCNIC }, { cnic }] });
    if (user) { user.name = fullName; user.cnic = cnic; user.isActive = student.accountStatus === "active"; await user.save(); }
    return NextResponse.json({ success: true, student });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "Another student already uses this CNIC or this roll number in the same class." }, { status: 409 });
    }
    if ((error as { name?: string }).name === "ValidationError") {
      const validation = error as { errors?: Record<string, { message?: string }> };
      const message = Object.values(validation.errors ?? {}).map((item) => item.message).filter(Boolean).join("; ");
      return NextResponse.json({ error: message || "Student details are invalid." }, { status: 400 });
    }
    console.error("Student update error:", error);
    return NextResponse.json({ error: "Unable to update student" }, { status: 500 });
  }
}
