import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Fee, SchoolConfiguration, Student } from "@/Models";
import { monthNames, pruneRetentionIfDue } from "@/lib/retention";
import { removeFeeIncome, syncFeeIncome } from "@/lib/finance";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();

    // A student reads only their own fee records.
    if (session.user.role === "student") {
      const student = await Student.findOne({ cnic: session.user.cnic }).lean();
      const fees = student ? await Fee.find({ student: student._id }).sort({ year: -1, createdAt: -1 }).limit(12).lean() : [];
      return NextResponse.json({ fees });
    }

    if (session.user.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const rawSearch = params.get("search")?.trim() ?? "";
    const search = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const className = params.get("class")?.trim() ?? "";
    const section = params.get("section")?.trim() ?? "";
    const now = new Date();
    const requestedMonth = params.get("month")?.trim() ?? "";
    const month = monthNames.includes(requestedMonth) ? requestedMonth : monthNames[now.getMonth()];
    const requestedYear = Number(params.get("year"));
    const year = Number.isInteger(requestedYear) && requestedYear > 0 ? requestedYear : now.getFullYear();
    const feeStatus = params.get("status")?.trim().toLowerCase() ?? "all";

    // Every student is listed. Class and section are compared without case so the
    // stored "9-a" still matches the selected "9-A".
    const scope: Record<string, unknown>[] = [{ accountStatus: { $in: ["active", "pending"] } }];
    if (className) scope.push({ class: { $regex: `^${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    if (section) scope.push({ section: { $regex: `^${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    if (search) {
      scope.push({
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { studentId: { $regex: search, $options: "i" } },
          { cnic: { $regex: search, $options: "i" } },
          { rollNumber: { $regex: search, $options: "i" } },
        ],
      });
    }

    // Ids for the whole scope first: light query, even when the school is large.
    const sortedIds = (await Student.find({ $and: scope }).sort({ class: 1, section: 1, rollNumber: 1 }).select("_id").lean()).map((student) => student._id);
    const fees = sortedIds.length
      ? await Fee.find({ student: { $in: sortedIds }, month, year }).select("student status amount paidDate").lean()
      : [];
    const feeByStudent = new Map(fees.map((fee) => [String(fee.student), fee]));
    const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).lean() : null;
    const monthlyFee = Number(school?.monthlyFee ?? 0);

    // Each class section can price its own fee. A section with fee 0 inherits
    // the school-wide monthly fee, so existing schools are unaffected.
    const pricedSections = await ClassSection.find({ isActive: true }).select("className sectionName fee").lean();
    const feeByClass = new Map(
      pricedSections.map((item) => [`${item.className}-${item.sectionName}`.toUpperCase(), Number(item.fee ?? 0)]),
    );
    const feeForStudent = (student: { class: string; section: string }) => {
      const classFee = feeByClass.get(`${student.class}-${student.section}`.toUpperCase()) ?? 0;
      return classFee > 0 ? classFee : monthlyFee;
    };

    const paidFeeStudentIds = new Set<string>();
    for (const fee of fees) if (fee.status === "paid") paidFeeStudentIds.add(String(fee.student));

    // Only ids are loaded for the whole scope; the browser receives one page of
    // full documents, which keeps the response small even on large schools.
    const limit = parsePageSize(params.get("limit"), 20);
    const visibleIds = sortedIds.filter((id) => {
      if (feeStatus !== "paid" && feeStatus !== "unpaid") return true;
      return feeStatus === "paid" ? paidFeeStudentIds.has(String(id)) : !paidFeeStudentIds.has(String(id));
    });
    const total = visibleIds.length;
    const pages = countPages(total, limit);
    const page = clampPage(parsePageNumber(params.get("page")), pages);
    const pageIds = visibleIds.slice((page - 1) * limit, page * limit);
    const pageStudents = pageIds.length ? await Student.find({ _id: { $in: pageIds } }).lean() : [];
    const studentById = new Map(pageStudents.map((student) => [String(student._id), student]));
    const rows = pageIds.flatMap((id) => {
      const student = studentById.get(String(id));
      if (!student) return [];
      const record = feeByStudent.get(String(id));
      return [{
        id: String(student._id),
        fullName: student.fullName,
        studentId: student.studentId ?? "",
        cnic: student.cnic ?? "",
        className: student.class,
        section: student.section,
        rollNumber: student.rollNumber ?? "",
        gender: student.gender ?? "",
        accountStatus: student.accountStatus ?? "active",
        amount: Number(record?.amount ?? feeForStudent(student)),
        status: record?.status === "paid" ? ("paid" as const) : ("unpaid" as const),
        paidDate: record?.paidDate ? new Date(record.paidDate).toISOString() : null,
      }];
    });

    // Filter options come from the whole school roster, so the class and section
    // dropdowns stay usable even when the current filters return no rows.
    const combos = await Student.aggregate([
      { $match: { accountStatus: { $in: ["active", "pending"] } } },
      { $group: { _id: { className: { $toUpper: { $ifNull: ["$class", ""] } }, section: { $toUpper: { $ifNull: ["$section", ""] } } } } },
      { $sort: { "_id.className": 1, "_id.section": 1 } },
    ]);
    const classSections = combos
      .map((combo) => `${combo._id.className}-${combo._id.section}`)
      .filter((item) => !item.startsWith("-") && !item.endsWith("-"));

    const paid = sortedIds.filter((id) => paidFeeStudentIds.has(String(id))).length;

    return NextResponse.json({
      students: rows,
      classSections,
      month,
      year,
      monthlyFee,
      summary: {
        total: sortedIds.length,
        paid,
        unpaid: sortedIds.length - paid,
        shown: visibleIds.length,
      },
      pagination: { page, pages, total, limit },
    });
  } catch (error) { console.error("Fee load error:", error); return NextResponse.json({ error: "Unable to load fees" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Only administrators can manage fees" }, { status: 403 });
  try {
    const body = await request.json(); await connectToDatabase();
    const month = String(body.month ?? ""); const year = Number(body.year); const studentId = String(body.studentId ?? ""); const action = String(body.action ?? "generate");
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    if (!months.includes(month) || !Number.isInteger(year) || !studentId) return NextResponse.json({ error: "Student, month, and year are required" }, { status: 400 });
    if (!mongoose.isValidObjectId(studentId)) return NextResponse.json({ error: "Student, month, and year are required" }, { status: 400 });
    if (!mongoose.isValidObjectId(session.user.school)) return NextResponse.json({ error: "School configuration is missing for this account" }, { status: 400 });
    const student = await Student.findById(studentId).lean(); if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const school = await SchoolConfiguration.findById(session.user.school).lean();

    // Charge the class's own fee when it has one, otherwise the school-wide fee.
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const classSection = await ClassSection.findOne({
      className: { $regex: `^${escape(String(student.class))}$`, $options: "i" },
      sectionName: { $regex: `^${escape(String(student.section))}$`, $options: "i" },
    }).select("fee").lean();
    const classFee = Number(classSection?.fee ?? 0);
    const amount = classFee > 0 ? classFee : Number(school?.monthlyFee ?? 0);

    const update = action === "paid" ? { $set: { amount, status: "paid", paidDate: new Date(), markedBy: session.user.id }, $setOnInsert: { student: student._id, month, year } } : { $set: { amount, status: "unpaid", paidDate: null, markedBy: session.user.id }, $setOnInsert: { student: student._id, month, year } };
    const fee = await Fee.findOneAndUpdate({ student: student._id, month, year }, update, { upsert: true, new: true, setDefaultsOnInsert: true });

    // Keep the finance ledger in step with the fee tabs: a payment becomes an
    // income row, and reversing the payment removes that row again. This is
    // what makes the income tab agree with the fees tab at all times.
    if (action === "paid") await syncFeeIncome(fee, { _id: student._id, fullName: student.fullName, class: student.class, section: student.section }, String(session.user.school), session.user.id);
    else await removeFeeIncome(fee._id);

    await pruneRetentionIfDue();
    return NextResponse.json({ success: true, fee });
  } catch (error) { console.error("Fee save error:", error); return NextResponse.json({ error: "Unable to save fee" }, { status: 500 }); }
}
