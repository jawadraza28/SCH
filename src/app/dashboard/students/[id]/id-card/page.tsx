import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { SchoolConfiguration, Student } from "@/Models";
import { ensureStudentAttendanceQrToken } from "@/lib/attendance-qr";
import PrintButton from "../../../../student/profile/PrintButton";
import StudentIdCard from "../../../../student/profile/StudentIdCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminStudentIdCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") redirect("/dashboard");
  await connectToDatabase();
  const student = await Student.findById((await params).id).lean();
  if (!student) notFound();
  const school = session.user.school ? await SchoolConfiguration.findById(session.user.school).select("schoolName schoolAddress schoolPhone schoolIcon").lean() : null;
  const qrToken = await ensureStudentAttendanceQrToken(String(student._id));
  const qrCodeDataUrl = await QRCode.toDataURL(qrToken, { width: 256, margin: 1 });

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8 print:bg-white">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/dashboard/students/${String(student._id)}`} className="text-sm font-medium text-blue-600">← Student profile</Link>
          <PrintButton />
        </div>
        <StudentIdCard
          schoolName={school?.schoolName ?? "School"}
          schoolAddress={school?.schoolAddress ?? ""}
          schoolPhone={school?.schoolPhone ?? ""}
          schoolIcon={school?.schoolIcon || "/logo.png"}
          qrCodeDataUrl={qrCodeDataUrl}
          student={student}
        />
      </div>
    </main>
  );
}
