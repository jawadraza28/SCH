import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { Student } from "@/Models";
import ExamSeatingGenerator from "@/components/ExamSeatingGenerator";
import { listClasses, listSections } from "@/lib/exam-seating";

export const dynamic = "force-dynamic";

export default async function DashboardExamSeatingPage() {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) redirect("/login");
  if (session.user.role !== "admin") redirect(session.user.role === "teacher" ? "/teacher" : "/student");

  await connectToDatabase();

  const students = await Student.find({}).select("fullName class section rollNumber").sort({ class: 1, section: 1, rollNumber: 1 }).lean();

  const roster = students.map((student) => ({
    _id: String(student._id),
    fullName: String(student.fullName),
    class: String(student.class),
    section: String(student.section),
    rollNumber: student.rollNumber ? String(student.rollNumber) : undefined,
  }));

  // The classes and sections the picker offers come from the live roster, so a
  // freshly added class appears without touching this page.
  const classNumbers = listClasses(roster);
  const sectionLetters = listSections(roster);

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Administration</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Exam seating generator</h1>
          <p className="mt-2 text-slate-500">
            Tick the classes to merge — every section of those classes seats together — then print the room-wise or class-wise plan.
          </p>
        </div>

        <ExamSeatingGenerator
          students={roster}
          availableClasses={classNumbers.length ? classNumbers : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
          availableSections={sectionLetters}
        />
      </div>
    </main>
  );
}
