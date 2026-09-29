import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { AuditLog } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const limit = parsePageSize(params.get("limit"), 20);
    const total = await AuditLog.countDocuments();
    const pages = countPages(total, limit);
    const page = clampPage(parsePageNumber(params.get("page")), pages);
    const logs = await AuditLog.find().sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "name email").lean();
    return NextResponse.json({ logs, pagination: { page, pages, total, limit } });
  }
  catch (error) { console.error("Audit load error:", error); return NextResponse.json({ error: "Unable to load audit history" }, { status: 500 }); }
}
