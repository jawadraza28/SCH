import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Fee, SchoolConfiguration, Student } from "@/Models";
import { monthNames, pruneRetentionIfDue } from "@/lib/retention";
import { removeFeeIncome, syncFeeIncome } from "@/lib/finance";
import { applyPayment, feePaidAmount, feeRemaining, feeStatusOf, type FeeStatus } from "@/lib/fees";
import { voucherRecipient } from "@/lib/voucher";
import { clampPage, countPages, parsePageNumber, parsePageSize } from "@/lib/pagination";

/** Escapes a literal so it can sit inside a `^…$` regex safely. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The students a fee screen means: every active or pending account, optionally
 * narrowed by class, section and free text. Class and section are compared
 * without case, so a stored "9-a" still matches the selected "9-A". Both the
 * list and the bulk "mark all paid" action share this, so the two can never
 * disagree about who is in scope.
 */
function scopeQuery(className: string, section: string, rawSearch: string) {
  const conditions: Record<string, unknown>[] = [{ accountStatus: { $in: ["active", "pending"] } }];
  if (className) conditions.push({ class: { $regex: `^${escapeRegex(className)}$`, $options: "i" } });
  if (section) conditions.push({ section: { $regex: `^${escapeRegex(section)}$`, $options: "i" } });
  const search = escapeRegex(rawSearch.trim());
  if (search) {
    conditions.push({
      $or: [
        { fullName: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
        { cnic: { $regex: search, $options: "i" } },
        { rollNumber: { $regex: search, $options: "i" } },
      ],
    });
  }
  return { $and: conditions };
}

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
    const className = params.get("class")?.trim() ?? "";
    const section = params.get("section")?.trim() ?? "";
    const now = new Date();
    const requestedMonth = params.get("month")?.trim() ?? "";
    const month = monthNames.includes(requestedMonth) ? requestedMonth : monthNames[now.getMonth()];
    const requestedYear = Number(params.get("year"));
    const year = Number.isInteger(requestedYear) && requestedYear > 0 ? requestedYear : now.getFullYear();
    const feeStatus = params.get("status")?.trim().toLowerCase() ?? "all";

    // Ids for the whole scope first: light query, even when the school is large.
    // Class and section come along so the outstanding total can price the months
    // that have no fee row yet.
    const sortedStudents = await Student.find(scopeQuery(className, section, rawSearch)).sort({ class: 1, section: 1, rollNumber: 1 }).select("_id class section").lean();
    const sortedIds = sortedStudents.map((student) => student._id);
    const fees = sortedIds.length
      ? await Fee.find({ student: { $in: sortedIds }, month, year }).select("student status amount paidAmount paidDate").lean()
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

    // One bucket per student for the selected month: unpaid, partly paid, or
    // paid. A student with no row yet is simply unpaid. The buckets are
    // mutually exclusive, so the summary counts always add up to the scope.
    const stateByStudent = new Map<string, { status: FeeStatus; due: number; paid: number }>();
    for (const fee of fees) {
      const due = Number(fee.amount ?? 0);
      const paid = feePaidAmount(fee);
      stateByStudent.set(String(fee.student), { status: feeStatusOf(due, paid), due, paid });
    }
    const stateOf = (id: unknown, student?: { class: string; section: string }) => {
      const known = stateByStudent.get(String(id));
      if (known) return known;
      const due = student ? feeForStudent(student) : 0;
      return { status: "unpaid" as FeeStatus, due, paid: 0 };
    };

    // Only ids are loaded for the whole scope; the browser receives one page of
    // full documents, which keeps the response small even on large schools.
    const limit = parsePageSize(params.get("limit"), 20);
    const wanted = feeStatus === "paid" || feeStatus === "partial" || feeStatus === "unpaid" ? feeStatus : "";
    const visibleIds = sortedIds.filter((id) => !wanted || stateOf(id).status === wanted);
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
      const due = Number(record?.amount ?? feeForStudent(student));
      const paid = feePaidAmount(record);
      return [{
        id: String(student._id),
        fullName: student.fullName,
        studentId: student.studentId ?? "",
        voucherNo: student.voucherNo ?? "",
        // Whoever should receive the fee voucher: guardian first, then the
        // emergency contact. Empty when the record carries no number at all,
        // which is what disables the Send button on the fees screen.
        voucherPhone: voucherRecipient(student),
        cnic: student.cnic ?? "",
        className: student.class,
        section: student.section,
        rollNumber: student.rollNumber ?? "",
        gender: student.gender ?? "",
        accountStatus: student.accountStatus ?? "active",
        amount: due,
        // What the office has actually received, and what is still owed — the
        // two numbers the custom-payment box and the student portal show.
        paidAmount: paid,
        remaining: feeRemaining(due, paid),
        status: feeStatusOf(due, paid),
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

    // Counts and money across the whole scope, not just this page, so the tiles
    // never jump as the admin pages through.
    const studentScopeById = new Map(sortedStudents.map((student) => [String(student._id), student]));
    const counts: Record<FeeStatus, number> = { paid: 0, partial: 0, unpaid: 0 };
    let collected = 0;
    let outstanding = 0;
    for (const id of sortedIds) {
      const state = stateOf(id, studentScopeById.get(String(id)));
      counts[state.status] += 1;
      collected += state.paid;
      outstanding += Math.max(0, state.due - state.paid);
    }

    return NextResponse.json({
      students: rows,
      classSections,
      month,
      year,
      monthlyFee,
      // Printed in the WhatsApp voucher header.
      schoolName: school?.schoolName ?? "",
      summary: {
        total: sortedIds.length,
        paid: counts.paid,
        partial: counts.partial,
        unpaid: counts.unpaid,
        shown: visibleIds.length,
        collected,
        outstanding,
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
    if (!months.includes(month) || !Number.isInteger(year)) return NextResponse.json({ error: "Month and year are required" }, { status: 400 });
    if (!mongoose.isValidObjectId(session.user.school)) return NextResponse.json({ error: "School configuration is missing for this account" }, { status: 400 });
    const school = await SchoolConfiguration.findById(session.user.school).lean();
    const schoolId = String(session.user.school);

    // ------------------------------------------------------------------
    // "Mark all paid": settles every student the current filters point at,
    // so the bulk button and the list above it always cover the same rows.
    // ------------------------------------------------------------------
    if (action === "paid-all") {
      const students = await Student.find(scopeQuery(String(body.class ?? ""), String(body.section ?? ""), String(body.search ?? "")))
        .sort({ class: 1, section: 1, rollNumber: 1 })
        .lean();
      // One price list instead of one lookup per student: a bulk run can cover
      // the whole school, and N+1 class queries would make it crawl.
      const priced = await ClassSection.find({}).select("className sectionName fee").lean();
      const priceByKey = new Map(priced.map((item) => [`${item.className}-${item.sectionName}`.toUpperCase(), Number(item.fee ?? 0)]));
      const schoolFee = Number(school?.monthlyFee ?? 0);
      const dueFor = (student: { class: string; section: string }) => {
        const classFee = priceByKey.get(`${student.class}-${student.section}`.toUpperCase()) ?? 0;
        return classFee > 0 ? classFee : schoolFee;
      };
      const existing = students.length
        ? await Fee.find({ student: { $in: students.map((student) => student._id) }, month, year }).select("student amount paidAmount status").lean()
        : [];
      const paidByStudent = new Map(existing.map((fee) => [String(fee.student), feePaidAmount(fee)]));

      let updated = 0;
    // Captured outside the callbacks: TypeScript (and the closure) both see a
    // plain string, and the role check above has already proved it exists.
    const markedBy = session.user.id;
    for (let index = 0; index < students.length; index += 20) {
      const chunk = students.slice(index, index + 20);
      await Promise.all(chunk.map(async (student) => {
        const amount = dueFor(student);
        // Already settled (or nothing to settle): leave the row alone, so the
        // date of an earlier payment is never rewritten.
        if (amount <= (paidByStudent.get(String(student._id)) ?? 0) + 0.001) return;
        const fee = await Fee.findOneAndUpdate(
          { student: student._id, month, year },
          { $set: { amount, paidAmount: amount, status: "paid", paidDate: new Date(), markedBy }, $setOnInsert: { student: student._id, month, year } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        await syncFeeIncome(fee, student, schoolId, markedBy);
        updated += 1;
      }));
    }

      await pruneRetentionIfDue();
      return NextResponse.json({ success: true, updated, total: students.length });
    }

    if (!studentId) return NextResponse.json({ error: "Student, month, and year are required" }, { status: 400 });
    if (!mongoose.isValidObjectId(studentId)) return NextResponse.json({ error: "Student, month, and year are required" }, { status: 400 });
    const student = await Student.findById(studentId).lean(); if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    // Charge the class's own fee when it has one, otherwise the school-wide fee.
    const classSection = await ClassSection.findOne({
      className: { $regex: `^${escapeRegex(String(student.class))}$`, $options: "i" },
      sectionName: { $regex: `^${escapeRegex(String(student.section))}$`, $options: "i" },
    }).select("fee").lean();
    const classFee = Number(classSection?.fee ?? 0);
    const amount = classFee > 0 ? classFee : Number(school?.monthlyFee ?? 0);

    const current = await Fee.findOne({ student: student._id, month, year }).lean();
    const alreadyPaid = feePaidAmount(current);
    const stillDue = feeRemaining(amount, alreadyPaid);

    // Three moves: settle the month in full, reverse it, or record whatever the
    // parent actually handed over — a custom payment against the balance.
    let paidAmount = 0;
    if (action === "paid") paidAmount = amount;
    else if (action === "unpaid") paidAmount = 0;
    else if (action === "pay") {
      const received = Number(body.received);
      if (!Number.isFinite(received) || received <= 0) return NextResponse.json({ error: "Enter an amount greater than zero" }, { status: 400 });
      if (received > stillDue + 0.001) return NextResponse.json({ error: `Only Rs ${Math.round(stillDue)} is still due for ${month} ${year}` }, { status: 400 });
      paidAmount = applyPayment(amount, alreadyPaid, received);
    } else {
      return NextResponse.json({ error: "Unknown fee action" }, { status: 400 });
    }

    // A school with no fee configured has nothing to count, but "mark paid"
    // still has to answer the way the admin asked it to.
    const status: FeeStatus = paidAmount > 0 ? feeStatusOf(amount, paidAmount) : action === "paid" ? "paid" : "unpaid";
    const update = { $set: { amount, paidAmount, status, paidDate: paidAmount > 0 ? new Date() : null, markedBy: session.user.id }, $setOnInsert: { student: student._id, month, year } };
    const fee = await Fee.findOneAndUpdate({ student: student._id, month, year }, update, { upsert: true, new: true, setDefaultsOnInsert: true });

    // Keep the finance ledger in step with the fee tabs: money received becomes
    // an income row of exactly that size, and reversing the payment removes the
    // row again. This is what makes the income tab agree with the fees tab.
    if (paidAmount > 0) await syncFeeIncome(fee, { _id: student._id, fullName: student.fullName, class: student.class, section: student.section }, schoolId, session.user.id);
    else await removeFeeIncome(fee._id);

    await pruneRetentionIfDue();
    return NextResponse.json({
      success: true,
      fee,
      amount,
      paidAmount,
      status,
      // What this call changed, so the screen can word its message correctly.
      received: paidAmount - alreadyPaid,
      remaining: feeRemaining(amount, paidAmount),
    });
  } catch (error) { console.error("Fee save error:", error); return NextResponse.json({ error: "Unable to save fee" }, { status: 500 }); }
}
