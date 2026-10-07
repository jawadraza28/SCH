import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ExamTerm } from "@/Models";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function adminOnly() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return { error: "Unauthorized", status: 401 as const };
  if (session.user.role !== "admin") return { error: "Only administrators can manage exam terms", status: 403 as const };
  return { school: session.user.school };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await adminOnly();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = await request.json();
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return NextResponse.json({ error: "Exam term title is required" }, { status: 400 });
      patch.title = title;
    }
    if (body.description !== undefined) patch.description = String(body.description).trim();
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    const startDate = body.startDate !== undefined ? String(body.startDate).trim() : undefined;
    const endDate = body.endDate !== undefined ? String(body.endDate).trim() : undefined;
    if (startDate !== undefined && startDate && !datePattern.test(startDate)) return NextResponse.json({ error: "Dates must be in YYYY-MM-DD format" }, { status: 400 });
    if (endDate !== undefined && endDate && !datePattern.test(endDate)) return NextResponse.json({ error: "Dates must be in YYYY-MM-DD format" }, { status: 400 });
    await connectToDatabase();
    const id = (await params).id;
    const current = await ExamTerm.findOne({ _id: id, school: access.school }).lean();
    if (!current) return NextResponse.json({ error: "Exam term not found" }, { status: 404 });
    const nextStart = startDate ?? current.startDate ?? "";
    const nextEnd = endDate ?? current.endDate ?? "";
    if (nextStart && nextEnd && nextEnd < nextStart) return NextResponse.json({ error: "The end date cannot be before the start date" }, { status: 400 });
    if (startDate !== undefined) patch.startDate = nextStart;
    if (endDate !== undefined) patch.endDate = nextEnd;
    const term = await ExamTerm.findByIdAndUpdate(id, patch, { new: true }).select("title academicYear startDate endDate description isActive").lean();
    return NextResponse.json({ success: true, term });
  } catch (error) {
    console.error("Exam term update error:", error);
    return NextResponse.json({ error: "Unable to update exam term" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await adminOnly();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    await connectToDatabase();
    const removed = await ExamTerm.findOneAndDelete({ _id: (await params).id, school: access.school }).lean();
    if (!removed) return NextResponse.json({ error: "Exam term not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Exam term deletion error:", error);
    return NextResponse.json({ error: "Unable to delete exam term" }, { status: 500 });
  }
}