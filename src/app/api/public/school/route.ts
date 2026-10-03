import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findOne()
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("schoolName schoolDescription schoolAddress schoolPhone schoolEmail academicYear")
      .lean();
    if (!school) return NextResponse.json({ school: null });

    return NextResponse.json({ school }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Public school details error:", error);
    return NextResponse.json({ error: "Unable to load school details" }, { status: 500 });
  }
}
