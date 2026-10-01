import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { pruneExpiredHomework } from "@/lib/retention";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    return NextResponse.json({ success: true, deleted: await pruneExpiredHomework() });
  } catch (error) {
    console.error("Homework cleanup error:", error);
    return NextResponse.json({ error: "Unable to clean expired homework" }, { status: 500 });
  }
}