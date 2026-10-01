import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Notice } from "@/Models";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const result = await Notice.deleteMany({ expiryDate: { $lt: new Date() } });
    return NextResponse.json({ success: true, deleted: result.deletedCount ?? 0 });
  } catch (error) {
    console.error("Notice cleanup error:", error);
    return NextResponse.json({ error: "Unable to clean expired notices" }, { status: 500 });
  }
}