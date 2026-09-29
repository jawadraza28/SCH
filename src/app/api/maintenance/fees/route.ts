import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Fee, SchoolConfiguration, Student } from "@/Models";
import { pruneFees } from "@/lib/retention";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findOne().lean();
    if (!school) return NextResponse.json({ error: "School configuration not found" }, { status: 404 });
    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "long" });
    const year = now.getFullYear();
    const students = await Student.find({ accountStatus: "active" }).select("_id").lean();
    const pruned = await pruneFees(now);
    let created = 0;
    for (const student of students) {
      const result = await Fee.updateOne({ student: student._id, month, year }, { $setOnInsert: { student: student._id, month, year, amount: school.monthlyFee, status: "unpaid" } }, { upsert: true });
      if (result.upsertedCount) created += 1;
    }
    return NextResponse.json({ success: true, month, year, created, pruned });
  } catch (error) { console.error("Fee generation error:", error); return NextResponse.json({ error: "Unable to generate fees" }, { status: 500 }); }
}
