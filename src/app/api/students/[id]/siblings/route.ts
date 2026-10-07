import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student } from "@/Models";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "teacher", "student"].includes(session.user.role)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    await connectToDatabase();
    const { id } = await params;
    const student = await Student.findById(id).select("_id fatherCNIC motherCNIC").lean();
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const parentCnics = [student.fatherCNIC, student.motherCNIC].map((value) => String(value ?? "").trim()).filter(Boolean);
    if (session.user.role === "student") {
      const own = await Student.findOne({ cnic: session.user.cnic }).select("_id fatherCNIC motherCNIC").lean();
      const ownParents = new Set([own?.fatherCNIC, own?.motherCNIC].map((value) => String(value ?? "").replace(/\D/g, "")).filter(Boolean));
      if (!own || !parentCnics.some((value) => ownParents.has(value.replace(/\D/g, "")))) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (!parentCnics.length) return NextResponse.json({ siblings: [] });
    const parentVariants = Array.from(new Set(parentCnics.flatMap((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length === 13 ? [value, digits, `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`] : [value];
    })));
    const siblings = await Student.find({
      _id: { $ne: student._id },
      $or: [
        { fatherCNIC: { $in: parentVariants } },
        { motherCNIC: { $in: parentVariants } },
      ],
      accountStatus: { $in: ["active", "pending"] },
    }).select("_id fullName studentId class section rollNumber profilePhotoUrl").sort({ class: 1, section: 1, rollNumber: 1 }).lean();
    return NextResponse.json({ siblings });
  } catch (error) {
    console.error("Sibling lookup error:", error);
    return NextResponse.json({ error: "Unable to load siblings" }, { status: 500 });
  }
}
