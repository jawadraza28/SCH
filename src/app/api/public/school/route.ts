import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration } from "@/Models";
import { signedR2Url } from "@/lib/object-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();
    const school = await SchoolConfiguration.findOne()
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("schoolName schoolDescription schoolAddress schoolPhone schoolEmail academicYear logo schoolIcon coverImage")
      .lean();
    if (!school) return NextResponse.json({ school: null });

    const result = { ...school, logo: "", schoolIcon: "", coverImage: "" };
    for (const field of ["logo", "schoolIcon", "coverImage"] as const) {
      const reference = school[field];
      if (reference?.startsWith("r2://")) result[field] = await signedR2Url(reference);
    }
    return NextResponse.json({ school: result }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Public school details error:", error);
    return NextResponse.json({ error: "Unable to load school details" }, { status: 500 });
  }
}
