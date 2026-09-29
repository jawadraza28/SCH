import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student } from "@/Models";

/**
 * The student roll number used to be unique across the whole school, which
 * blocked the same roll number in different classes. This endpoint removes that
 * legacy index and creates the new per class and section roll number index.
 * Administrators only. Safe to run more than once.
 */
export async function GET() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const collection = Student.collection;
    const indexes = await collection.indexes();
    const dropped: string[] = [];
    for (const index of indexes) {
      if (index.name === "_id_") continue;
      const keys = Object.keys(index.key ?? {});
      // Any single field index on rollNumber is the legacy global unique index.
      if (keys.length === 1 && keys[0] === "rollNumber" && index.name) {
        await collection.dropIndex(index.name);
        dropped.push(index.name);
      }
    }
    await Student.createIndexes();
    const remaining = (await collection.indexes()).map((index) => String(index.name));
    return NextResponse.json({ success: true, dropped, indexes: remaining });
  } catch (error) {
    console.error("Student index sync error:", error);
    return NextResponse.json({ error: "Unable to synchronise student indexes" }, { status: 500 });
  }
}
