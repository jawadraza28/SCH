import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { ClassSection, Fee, SchoolConfiguration, Student } from "@/Models";
import { monthNames } from "@/lib/retention";
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
      const currentSection = student
        ? await ClassSection.findOne({ className: student.class, sectionName: student.section }).select("academicYear startDate endDate").lean()
        : null;
      const sessionStart = currentSection?.startDate ? new Date(`${currentSection.startDate}T00:00:00Z`) : null;
      const sessionEnd = currentSection?.endDate ? new Date(`${currentSection.endDate}T23:59:59Z`) : null;
      const fees = student && sessionStart && sessionEnd
        ? (await Fee.find({ student: student._id, academicYear: currentSection.academicYear || student.academicYear || "" }).sort({ year: -1, createdAt: -1 }).lean())
          .filter((fee) => {
            const feeDate = new Date(Date.UTC(Number(fee.year), monthNames.indexOf(fee.month), 1));
            return feeDate >= new Date(Date.UTC(sessionStart.getUTCFullYear(), sessionStart.getUTCMonth(), 1))
              && feeDate <= new Date(Date.UTC(sessionEnd.getUTCFullYear(), sessionEnd.getUTCMonth(), 1));
          })
        : [];
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
    const sortedStudents = await Student.find(scopeQuery(className, section, rawSearch)).sort({ class: 1, section: 1, rollNumber: 1 }).select("_id class section academicYear").lean();
    const sectionRecords = await ClassSection.find({
      $or: sortedStudents.map((student) => ({ className: student.class, sectionName: student.section })),
    }).select("className sectionName startDate endDate").lean();
    const sectionByKey = new Map(sectionRecords.map((item) => [`${item.className}-${item.sectionName}`.toUpperCase(), item]));
    const selectedMonthDate = new Date(Date.UTC(year, monthNames.indexOf(month), 1));
    const nowMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const studentsInSession = sortedStudents.filter((student) => {
      const currentSection = sectionByKey.get(`${student.class}-${student.section}`.toUpperCase());
      if (!currentSection?.startDate || !currentSection?.endDate) return false;
      const sessionStart = new Date(`${currentSection.startDate}T00:00:00Z`);
      const sessionEnd = new Date(`${currentSection.endDate}T23:59:59Z`);
      return selectedMonthDate >= new Date(Date.UTC(sessionStart.getUTCFullYear(), sessionStart.getUTCMonth(), 1))
        && selectedMonthDate <= new Date(Date.UTC(sessionEnd.getUTCFullYear(), sessionEnd.getUTCMonth(), 1))
        && selectedMonthDate <= nowMonthDate;
    });
    const sortedIds = studentsInSession.map((student) => student._id);
    const fees = sortedIds.length
      ?       await Fee.find({ student: { $in: sortedIds }, month, year, $or: sortedStudents.map((student) => ({ student: student._id, academicYear: student.academicYear || "" })) }).select("student academicYear status amount baseAmount discountAmount discountReason paidAmount paidDate").lean()
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
    // A stored row with amount 0 is a leftover from before a fee was configured;
    // it is re-priced with the live class/school fee here, so every student of
    // the same class shows the same fee and the same balance everywhere.
    const studentScopeById = new Map(studentsInSession.map((student) => [String(student._id), student]));
    const stateByStudent = new Map<string, { status: FeeStatus; due: number; paid: number }>();
    for (const fee of fees) {
      const stored = Number(fee.amount ?? 0);
      const scopeStudent = studentScopeById.get(String(fee.student));
      const hasExplicitPrice = stored > 0 || Number(fee.discountAmount ?? 0) > 0 || Number(fee.baseAmount ?? 0) > 0;
      const due = hasExplicitPrice ? stored : scopeStudent ? feeForStudent(scopeStudent) : stored;
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
    // `all=1` hands back every row in scope instead of one page — the bulk
    // "Send all vouchers" action needs phone numbers and balances for the
    // whole view, not just the twenty rows on screen.
    const pageIds = params.get("all") === "1" ? visibleIds : visibleIds.slice((page - 1) * limit, page * limit);
    const pageStudents = pageIds.length ? await Student.find({ _id: { $in: pageIds } }).lean() : [];
    const studentById = new Map(pageStudents.map((student) => [String(student._id), student]));
    const rows = pageIds.flatMap((id) => {
      const student = studentById.get(String(id));
      if (!student) return [];
      const record = feeByStudent.get(String(id));
      // A stored amount of 0 is stale (written before a fee existed) — fall
      // back to the live class/school fee so the row matches the buckets above.
      const storedDue = Number(record?.amount ?? 0);
      const hasExplicitPrice = storedDue > 0 || Number(record?.discountAmount ?? 0) > 0 || Number(record?.baseAmount ?? 0) > 0;
      const due = hasExplicitPrice ? storedDue : feeForStudent(student);
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
        baseAmount: Number(record?.baseAmount ?? due),
        discountAmount: Number(record?.discountAmount ?? 0),
        discountReason: String(record?.discountReason ?? ""),
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
      const dueFor = (student: { class: string; section: string }, existingFee?: { amount?: number; baseAmount?: number; discountAmount?: number }) => {
        const classFee = priceByKey.get(`${student.class}-${student.section}`.toUpperCase()) ?? 0;
        if (existingFee && (Number(existingFee.discountAmount ?? 0) > 0 || Number(existingFee.baseAmount ?? 0) > 0)) return Number(existingFee.amount ?? 0);
        return classFee > 0 ? classFee : schoolFee;
      };
      const existing = students.length
        ? await Fee.find({ student: { $in: students.map((student) => student._id) }, month, year, $or: students.map((student) => ({ student: student._id, academicYear: student.academicYear || "" })) }).select("student academicYear amount baseAmount discountAmount discountReason paidAmount status").lean()
        : [];
      const paidByStudent = new Map(existing.map((fee) => [String(fee.student), feePaidAmount(fee)]));

      // Ids actually settled in this run: the receipt queue lists only the
      // students whose payment changed, not everyone in scope.
      const updatedIds = new Set<string>();
      // Captured outside the callbacks: TypeScript (and the closure) both see a
      // plain string, and the role check above has already proved it exists.
      const markedBy = session.user.id;
    for (let index = 0; index < students.length; index += 20) {
      const chunk = students.slice(index, index + 20);
      await Promise.all(chunk.map(async (student) => {
        const existingFee = existing.find((fee) => String(fee.student) === String(student._id));
        const amount = dueFor(student, existingFee);
        // Already settled (or nothing to settle): leave the row alone, so the
        // date of an earlier payment is never rewritten.
        if (amount <= (paidByStudent.get(String(student._id)) ?? 0) + 0.001) return;
        const fee = await Fee.findOneAndUpdate(
          { student: student._id, month, year, academicYear: student.academicYear || "" },
          { $set: { amount, academicYear: student.academicYear || "", baseAmount: Number(existingFee?.baseAmount ?? amount), discountAmount: Number(existingFee?.discountAmount ?? 0), discountReason: String(existingFee?.discountReason ?? ""), paidAmount: amount, status: "paid", paidDate: new Date(), markedBy }, $setOnInsert: { student: student._id, month, year, academicYear: student.academicYear || "" } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        await syncFeeIncome(fee, student, schoolId, markedBy);
        updatedIds.add(String(student._id));
      }));
    }

      // Reported in scope order so the panel lists classes as the table does,
      // with the phone the receipt would go to and the fee that was settled.
      const settled = students
        .filter((student) => updatedIds.has(String(student._id)))
        .map((student) => ({
          fullName: student.fullName,
          className: student.class,
          section: student.section,
          rollNumber: student.rollNumber ?? "",
          phone: voucherRecipient(student),
          amount: dueFor(student, existing.find((fee) => String(fee.student) === String(student._id))),
        }));
      return NextResponse.json({ success: true, updated: updatedIds.size, total: students.length, settled });
    }

    if (!studentId) return NextResponse.json({ error: "Student, month, and year are required" }, { status: 400 });
    if (!mongoose.isValidObjectId(studentId)) return NextResponse.json({ error: "Student, month, and year are required" }, { status: 400 });
    const student = await Student.findById(studentId).lean(); if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    // Charge the class's own fee when it has one, otherwise the school-wide fee.
    const classSection = await ClassSection.findOne({
      className: { $regex: `^${escapeRegex(String(student.class))}$`, $options: "i" },
      sectionName: { $regex: `^${escapeRegex(String(student.section))}$`, $options: "i" },
    }).select("fee academicYear").lean();
    const classFee = Number(classSection?.fee ?? 0);
    const academicYear = String(student.academicYear || classSection?.academicYear || "");
    const current = await Fee.findOne({ student: student._id, month, year, academicYear }).lean();
    const baseAmount = classFee > 0 ? classFee : Number(school?.monthlyFee ?? 0);
    const currentDiscount = Number(current?.discountAmount ?? 0);
    const amount = currentDiscount > 0 ? Math.max(0, baseAmount - currentDiscount) : baseAmount;
    const alreadyPaid = feePaidAmount(current);
    if (action === "discount") {
      const discount = Number(body.discountAmount);
      const reason = String(body.discountReason ?? "").trim();
      if (!Number.isFinite(discount) || discount < 0 || discount > amount) return NextResponse.json({ error: "Discount must be between zero and the full fee" }, { status: 400 });
      const netAmount = Math.max(0, baseAmount - discount);
      if (alreadyPaid > netAmount + 0.001) return NextResponse.json({ error: "This discount would be lower than the amount already paid" }, { status: 409 });
      const status: FeeStatus = feeStatusOf(netAmount, alreadyPaid);
      const fee = await Fee.findOneAndUpdate(
        { student: student._id, month, year, academicYear },
        { $set: { amount: netAmount, academicYear, baseAmount: amount, discountAmount: discount, discountReason: reason, paidAmount: alreadyPaid, status, markedBy: session.user.id }, $setOnInsert: { student: student._id, month, year, academicYear } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return NextResponse.json({ success: true, amount: netAmount, baseAmount: amount, discountAmount: discount, status, paidAmount: alreadyPaid, remaining: feeRemaining(netAmount, alreadyPaid), fee });
    }
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
    const update = { $set: { amount, academicYear, baseAmount, discountAmount: currentDiscount, discountReason: String(current?.discountReason ?? ""), paidAmount, status, paidDate: paidAmount > 0 ? new Date() : null, markedBy: session.user.id }, $setOnInsert: { student: student._id, month, year, academicYear } };
    const fee = await Fee.findOneAndUpdate({ student: student._id, month, year, academicYear }, update, { upsert: true, new: true, setDefaultsOnInsert: true });

    // Keep the finance ledger in step with the fee tabs: money received becomes
    // an income row of exactly that size, and reversing the payment removes the
    // row again. This is what makes the income tab agree with the fees tab.
    if (paidAmount > 0) await syncFeeIncome(fee, { _id: student._id, fullName: student.fullName, class: student.class, section: student.section }, schoolId, session.user.id);
    else await removeFeeIncome(fee._id);

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
