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
    await Notice.deleteMany({ expiryDate: { $lt: new Date() } });
    const params = new URL(request.url).searchParams;
    const limit = parsePageSize(params.get("limit"), 20);
    const audience = session.user.role === "teacher" ? "teachers" : session.user.role === "student" ? "students" : "";
    const student = session.user.role === "student" ? await (await import("@/Models")).Student.findOne({ cnic: session.user.cnic }).select("class section").lean() : null;
    const classSection = student ? `${student.class}-${student.section}`.toUpperCase() : "";
    const audienceQuery = audience ? { $or: [{ audience: { $in: ["all", audience] } }, { audience: { $exists: false } }] } : {};
    const classQuery = classSection ? { $or: [{ classSection: "" }, { classSection }] } : {};
    const query = { $and: [{ school: session.user.school, published: true }, audienceQuery, classQuery, { $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: new Date() } }] }] };
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
    const body = await request.json(); const title = String(body.title ?? "").trim(); const description = String(body.description ?? "").trim(); const type = String(body.type ?? "general"); const audience = String(body.audience ?? "all"); const classSection = String(body.classSection ?? "").trim().toUpperCase();
    if (!title || !description) return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    const allowed = ["general", "exam", "holiday", "event", "important", "fee", "result"];
    if (!allowed.includes(type)) return NextResponse.json({ error: "Invalid notice type" }, { status: 400 });
    if (!["all", "teachers", "students"].includes(audience)) return NextResponse.json({ error: "Invalid notice audience" }, { status: 400 });
    await connectToDatabase();
    const notice = await Notice.create({ title, description, type, audience, classSection, published: body.published !== false, expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined, createdBy: session.user.id, school: session.user.school });
    return NextResponse.json({ success: true, notice }, { status: 201 });
  } catch (error) { console.error("Notice creation error:", error); return NextResponse.json({ error: "Unable to create notice" }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Only administrators can delete notices" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return NextResponse.json({ error: "A valid notice id is required" }, { status: 400 });
  try {
    await connectToDatabase();
    const deleted = await Notice.findOneAndDelete({ _id: id, school: session.user.school }).lean();
    if (!deleted) return NextResponse.json({ error: "Notice not found" }, { status: 404 });
    return NextResponse.json({ success: true, id });
  } catch (error) { console.error("Notice deletion error:", error); return NextResponse.json({ error: "Unable to delete notice" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Only administrators can edit notices" }, { status: 403 });
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return NextResponse.json({ error: "A valid notice id is required" }, { status: 400 });
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const type = String(body.type ?? "general"); const audience = String(body.audience ?? "all"); const classSection = String(body.classSection ?? "").trim().toUpperCase();
    if (!title || !description) return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    if (!["general", "exam", "holiday", "event", "important", "fee", "result"].includes(type)) return NextResponse.json({ error: "Invalid notice type" }, { status: 400 });
    if (!["all", "teachers", "students"].includes(audience)) return NextResponse.json({ error: "Invalid notice audience" }, { status: 400 });
    await connectToDatabase();
    const notice = await Notice.findOneAndUpdate({ _id: id, school: session.user.school }, { title, description, type, audience, classSection, published: body.published !== false, expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined }, { new: true, runValidators: true }).lean();
    if (!notice) return NextResponse.json({ error: "Notice not found" }, { status: 404 });
    return NextResponse.json({ success: true, notice });
  } catch (error) { console.error("Notice update error:", error); return NextResponse.json({ error: "Unable to update notice" }, { status: 500 }); }
}
