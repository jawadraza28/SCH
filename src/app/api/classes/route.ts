import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Student, Teacher } from "@/Models";

async function adminAccess() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "admin") return { error: "Administrator access required", status: 403 };
  return { user: session.user };
}

export async function GET() {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    const classes = await ClassSection.find({ isActive: true }).sort({ className: 1, sectionName: 1 }).lean();
    // Live seat usage, so callers can show "occupied/capacity" without a stale counter.
    const roster = await Student.find({ accountStatus: { $in: ["active", "pending"] } }).select("class section").lean();
    const occupiedByClass = new Map<string, number>();
    for (const student of roster) {
      const key = `${student.class}-${student.section}`.toUpperCase();
      occupiedByClass.set(key, (occupiedByClass.get(key) ?? 0) + 1);
    }
    return NextResponse.json({
      classes: classes.map((item) => ({ ...item, occupied: occupiedByClass.get(`${item.className}-${item.sectionName}`.toUpperCase()) ?? 0 })),
    });
  } catch (error) {
    console.error("Class list error:", error);
    return NextResponse.json({ error: "Unable to load classes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const className = String(body.className ?? "").trim();
    const sectionName = String(body.sectionName ?? "").trim().toUpperCase();
    const academicYear = String(body.academicYear ?? "2026-2027").trim();
    if (!className || !sectionName || !academicYear) return NextResponse.json({ error: "Class, section, and academic year are required" }, { status: 400 });
    const capacity = Number(body.capacity);
    const fee = Number(body.fee);
    if (!Number.isFinite(capacity) || capacity < 1) return NextResponse.json({ error: "Capacity must be at least 1" }, { status: 400 });
    // A class may price differently from the school-wide fee; 0 means "inherit".
    if (!Number.isFinite(fee) || fee < 0) return NextResponse.json({ error: "Class fee cannot be negative" }, { status: 400 });
    await connectToDatabase();
    const duplicate = await ClassSection.findOne({ className, sectionName, academicYear }).lean();
    if (duplicate) return NextResponse.json({ error: "This class and section already exists" }, { status: 409 });
    const created = await ClassSection.create({ className, sectionName, academicYear, capacity, fee });
    return NextResponse.json({ success: true, classSection: created }, { status: 201 });
  } catch (error) {
    console.error("Class creation error:", error);
    return NextResponse.json({ error: "Unable to create class" }, { status: 500 });
  }
}

/**
 * PATCH /api/classes — edits a section's details, including its monthly fee.
 * Changing the fee only affects months that have not been paid yet; already
 * paid fees keep the amount that was actually charged (see the fees route).
 */
export async function PATCH(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const className = String(body.className ?? "").trim();
    const sectionName = String(body.sectionName ?? "").trim().toUpperCase();
    const academicYear = String(body.academicYear ?? "").trim();
    const capacity = Number(body.capacity);
    const fee = Number(body.fee);
    if (!id || !className || !sectionName || !academicYear) {
      return NextResponse.json({ error: "Class, section, and academic year are required" }, { status: 400 });
    }
    if (!Number.isFinite(capacity) || capacity < 1) return NextResponse.json({ error: "Capacity must be at least 1" }, { status: 400 });
    if (!Number.isFinite(fee) || fee < 0) return NextResponse.json({ error: "Class fee cannot be negative" }, { status: 400 });
    await connectToDatabase();
    const duplicate = await ClassSection.findOne({ className, sectionName, academicYear, _id: { $ne: id } }).lean();
    if (duplicate) return NextResponse.json({ error: "This class and section already exists" }, { status: 409 });
    const updated = await ClassSection.findByIdAndUpdate(
      id,
      { $set: { className, sectionName, academicYear, capacity, fee } },
      { new: true },
    );
    if (!updated) return NextResponse.json({ error: "Class not found" }, { status: 404 });
    return NextResponse.json({ success: true, classSection: updated });
  } catch (error) {
    console.error("Class update error:", error);
    return NextResponse.json({ error: "Unable to update class" }, { status: 500 });
  }
}

/**
 * DELETE /api/classes — retires a class section.
 *
 * A section is never hard-deleted: fees, attendance, results and timetables all
 * point at it, so the row is switched off (`isActive: false`) and vanishes from
 * every picker. Students are blocked first, because moving them later would
 * strand their seat numbers and fee history in a class that no longer exists.
 */
export async function DELETE(request: Request) {
  const access = await adminAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Class is required" }, { status: 400 });
    await connectToDatabase();
    const classSection = await ClassSection.findById(id).lean();
    if (!classSection || !classSection.isActive) return NextResponse.json({ error: "Class not found" }, { status: 404 });

    const enrolled = await Student.countDocuments({
      class: classSection.className,
      section: classSection.sectionName,
      accountStatus: { $in: ["active", "pending"] },
    });
    if (enrolled > 0) {
      const label = `${classSection.className}-${classSection.sectionName}`;
      return NextResponse.json(
        { error: `${enrolled} student${enrolled === 1 ? "" : "s"} still attend ${label}. Move or remove them before deleting the class.` },
        { status: 409 },
      );
    }

    // The assignment string is what the teacher routes store, so dropping the
    // class has to drop it there too — otherwise the dropdown offers a class
    // that no longer exists.
    const key = `${classSection.className}-${classSection.sectionName}`.toUpperCase();
    const assigned = await Teacher.find({ assignedClasses: key }).lean();
    await ClassSection.updateOne({ _id: id }, { $set: { isActive: false } });
    for (const teacher of assigned) {
      const remaining = (teacher.assignedClasses ?? []).filter((item: unknown) => String(item).toUpperCase() !== key);
      await Teacher.updateOne({ _id: teacher._id }, {
        $set: {
          assignedClasses: remaining,
          assignedSections: remaining.map((item: unknown) => String(item).split("-").slice(1).join("-")),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Class deletion error:", error);
    return NextResponse.json({ error: "Unable to delete class" }, { status: 500 });
  }
}
