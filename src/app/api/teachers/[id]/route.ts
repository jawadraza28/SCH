import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Teacher, User } from "@/Models";
import { ClassSection, Homework } from "@/Models";
import { deleteFromR2 } from "@/lib/object-storage";
import { deleteCloudinaryPhoto } from "@/lib/cloudinary";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const teacher = await Teacher.findById((await context.params).id).lean();
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    const user = await User.findOne({ role: "teacher", cnic: teacher.cnic }).select("email").lean();
    return NextResponse.json({ teacher: { ...teacher, email: user?.email ?? "" } });
  } catch (error) {
    console.error("Teacher detail error:", error);
    return NextResponse.json({ error: "Unable to load teacher" }, { status: 500 });
  }

}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const teacher = await Teacher.findById((await context.params).id);
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    await Promise.all([
      User.deleteMany({ role: "teacher", cnic: teacher.cnic }),
      Homework.deleteMany({ assignedBy: teacher._id }),
      ClassSection.updateMany({ teacherId: teacher._id }, { $unset: { teacherId: 1 } }),
    ]);
    if (teacher.profilePhotoUrl?.startsWith("r2://")) {
      await deleteFromR2(teacher.profilePhotoUrl).catch((error) => console.warn("Teacher photo cleanup failed:", error));
    }
    if (teacher.profilePhotoPublicId) await deleteCloudinaryPhoto(teacher.profilePhotoPublicId).catch((error) => console.warn("Teacher Cloudinary photo cleanup failed:", error));
    await Teacher.deleteOne({ _id: teacher._id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Teacher deletion error:", error);
    return NextResponse.json({ error: "Unable to delete teacher and related records" }, { status: 500 });
  }
}
