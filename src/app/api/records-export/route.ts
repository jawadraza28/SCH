import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Attendance, ClassSection, Fee, Homework, Result, Student, StudentBehavior } from "@/Models";
import { createZip } from "@/lib/zip";

const csv = (rows: unknown[][]) => rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`).join(",")).join("\n");
const dateText = (value: unknown) => value ? new Date(String(value)).toISOString() : "";

export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try {
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const studentIds = params.getAll("studentId").map((value) => value.trim()).filter(Boolean);
    const studentId = studentIds[0] ?? "";
    const className = params.get("class")?.trim() ?? "";
    const section = params.get("section")?.trim().toUpperCase() ?? "";
    if (!studentId && !className) return NextResponse.json({ error: "Select a student or class first." }, { status: 400 });
    const studentQuery = studentIds.length ? { _id: { $in: studentIds } } : { class: className, ...(section ? { section } : {}) };
    const students = await Student.find(studentQuery).select("-password").sort({ class: 1, section: 1, rollNumber: 1 }).lean();
    if (!students.length) return NextResponse.json({ error: "No students found for this selection." }, { status: 404 });
    const ids = students.map((student) => student._id);
    const [attendance, fees, results, behavior] = await Promise.all([
      Attendance.find({ student: { $in: ids } }).sort({ date: 1 }).lean(),
      Fee.find({ student: { $in: ids } }).sort({ year: 1, month: 1 }).lean(),
      Result.find({ student: { $in: ids } }).populate("examTerm", "title academicYear startDate endDate").sort({ createdAt: 1 }).lean(),
      StudentBehavior.find({ student: { $in: ids } }).sort({ observedAt: 1 }).lean(),
    ]);
    const classSections = [...new Set(students.map((student) => `${student.class}-${student.section}`))];
    const homework = await Homework.find({ classSection: { $in: classSections } }).sort({ createdAt: 1 }).lean();
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    const files = [
      { name: "README.txt", content: `School records export\nCreated: ${new Date().toISOString()}\nStudents: ${students.length}\nAttendance records: ${attendance.length}\nFee records: ${fees.length}\nResult records: ${results.length}\nBehavior records: ${behavior.length}\nClass homework: ${homework.length}\n\nThis archive contains the student profile and all stored operational records. Promotion can safely remove the old records after this download is saved.\n` },
      { name: "students.csv", content: csv([["Student ID", "Name", "CNIC", "Class", "Section", "Roll number", "Academic year", "Father", "Father phone", "Mother", "Mother phone", "Admission date"], ...students.map((student) => [student.studentId, student.fullName, student.cnic, student.class, student.section, student.rollNumber, student.academicYear, student.fatherName, student.fatherPhone, student.motherName, student.motherPhone, dateText(student.admissionDate)])]) },
      { name: "attendance.csv", content: csv([["Student", "Student ID", "Class section", "Academic year", "Date", "Status"], ...attendance.map((record) => { const student = studentById.get(String(record.student)); return [student?.fullName, student?.studentId, record.classSection, record.academicYear, dateText(record.date), record.status]; })]) },
      { name: "fees.csv", content: csv([["Student", "Student ID", "Month", "Year", "Academic year", "Amount", "Paid amount", "Status", "Discount", "Paid date"], ...fees.map((record) => { const student = studentById.get(String(record.student)); return [student?.fullName, student?.studentId, record.month, record.year, record.academicYear, record.amount, record.paidAmount, record.status, record.discountAmount, dateText(record.paidDate)]; })]) },
      { name: "results.csv", content: csv([["Student", "Student ID", "Exam term", "Academic year", "Subject", "Total marks", "Passing marks", "Obtained marks", "Percentage", "Result", "Created"], ...results.map((record) => { const student = studentById.get(String(record.student)); const term = record.examTerm && typeof record.examTerm === "object" ? record.examTerm as { title?: string; academicYear?: string } : {}; return [student?.fullName, student?.studentId, term.title, term.academicYear, record.subject, record.totalMarks, record.passingMarks, record.obtainedMarks, record.percentage, record.result, dateText(record.createdAt)]; })]) },
      { name: "behavior.csv", content: csv([["Student", "Student ID", "Rating", "Note", "Observed"], ...behavior.map((record) => { const student = studentById.get(String(record.student)); return [student?.fullName, student?.studentId, record.rating, record.note, dateText(record.observedAt)]; })]) },
      { name: "homework.csv", content: csv([["Class section", "Title", "Subject", "Description", "Due date", "Created"], ...homework.map((record) => [record.classSection, record.title, record.subject, record.description, dateText(record.dueDate), dateText(record.createdAt)])]) },
    ];
    const archive = createZip(files);
    const label = studentId ? `student-${studentId}` : `class-${className}-${section || "all"}`;
    return new Response(archive, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${label}-records.zip"` } });
  } catch (error) {
    console.error("Records export error:", error);
    return NextResponse.json({ error: "Unable to create records export." }, { status: 500 });
  }
}
