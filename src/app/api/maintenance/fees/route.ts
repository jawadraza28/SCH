import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Fee, SchoolConfiguration, Student } from "@/Models";
import { pruneFees } from "@/lib/retention";
import { monthNames } from "@/lib/retention";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findOne().lean();
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    const now = new Date();
    const month = monthNames[now.getUTCMonth()];
    const year = now.getUTCFullYear();
    const students = await Student.find({ accountStatus: "active" }).select("_id class section").lean();
    const pruned = await pruneFees(now);

    // Each class section can price its own fee; a section with no fee inherits
    // the school-wide monthly fee, so existing schools behave exactly as before.
    const sections = await ClassSection.find({ isActive: true }).select("className sectionName fee").lean();
    const feeByClass = new Map(
      sections.map((item) => [`${item.className}-${item.sectionName}`.toUpperCase(), Number(item.fee ?? 0)]),
    );
    const schoolFee = Number(school.monthlyFee ?? 0);
    const feeFor = (student: { class: string; section: string }) => {
      const classFee = feeByClass.get(`${student.class}-${student.section}`.toUpperCase()) ?? 0;
      return classFee > 0 ? classFee : schoolFee;
    };

    let created = 0;
    for (const student of students) {
      const result = await Fee.updateOne({ student: student._id, month, year }, { $setOnInsert: { student: student._id, month, year, amount: feeFor(student), status: "unpaid" } }, { upsert: true });
      if (result.upsertedCount) created += 1;
    }
    return NextResponse.json({ success: true, month, year, created, pruned });
  } catch (error) { console.error("Fee generation error:", error); return NextResponse.json({ error: "Unable to generate fees" }, { status: 500 }); }
}
