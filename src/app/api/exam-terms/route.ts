import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ExamTerm } from "@/Models";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validateWindow(startDate: string, endDate: string) {
  if ((startDate && !datePattern.test(startDate)) || (endDate && !datePattern.test(endDate))) {
    return "Dates must be in YYYY-MM-DD format";
  }
  if (startDate && endDate && endDate < startDate) return "The end date cannot be before the start date";
  return "";
}

/** Exam terms are readable by every signed-in role — students need them for the date-sheet boxes. */
export async function GET() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const terms = await ExamTerm.find({ school: session.user.school })
      .sort({ startDate: -1, createdAt: -1 })
      .select("title academicYear startDate endDate description isActive createdAt")
      .lean();
    return NextResponse.json({ terms });
  } catch (error) {
    console.error("Exam term load error:", error);
    return NextResponse.json({ error: "Unable to load exam terms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Only administrators can manage exam terms" }, { status: 403 });
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const academicYear = String(body.academicYear ?? "2026-2027").trim();
    const startDate = String(body.startDate ?? "").trim();
    const endDate = String(body.endDate ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (!title) return NextResponse.json({ error: "Exam term title is required" }, { status: 400 });
    const windowError = validateWindow(startDate, endDate);
    if (windowError) return NextResponse.json({ error: windowError }, { status: 400 });
    await connectToDatabase();
    const term = await ExamTerm.create({ title, academicYear, startDate, endDate, description, school: session.user.school });
    return NextResponse.json({ success: true, term }, { status: 201 });
  } catch (error) {
    console.error("Exam term creation error:", error);
    return NextResponse.json({ error: "Unable to create exam term" }, { status: 500 });
  }
}