import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Notice } from "@/Models";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const limit = parsePageSize(params.get("limit"), 20);
    const query = { published: true, $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: new Date() } }] };
    const total = await Notice.countDocuments(query);
    const pages = countPages(total, limit);
    const page = clampPage(parsePageNumber(params.get("page")), pages);
    const notices = await Notice.find(query).sort({ publishDate: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return NextResponse.json({ notices, pagination: { page, pages, total, limit } });
  } catch (error) { console.error("Notice list error:", error); return NextResponse.json({ error: "Unable to load notices" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Only administrators can create notices" }, { status: 403 });
  try {
    const body = await request.json(); const title = String(body.title ?? "").trim(); const description = String(body.description ?? "").trim(); const type = String(body.type ?? "general");
    if (!title || !description) return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    const allowed = ["general", "exam", "holiday", "event", "important", "fee", "result"];
    if (!allowed.includes(type)) return NextResponse.json({ error: "Invalid notice type" }, { status: 400 });
    await connectToDatabase();
    const notice = await Notice.create({ title, description, type, published: body.published !== false, expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined, createdBy: session.user.id, school: session.user.school });
    return NextResponse.json({ success: true, notice }, { status: 201 });
  } catch (error) { console.error("Notice creation error:", error); return NextResponse.json({ error: "Unable to create notice" }, { status: 500 }); }
}
