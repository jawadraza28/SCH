"use client";

import { useEffect, useState } from "react";

type Student = { _id: string; fullName: string; studentId?: string; class: string; section: string };
type ClassItem = { className: string; sectionName: string; academicYear?: string; startDate?: string; endDate?: string };

export default function RecordsExportWorkspace() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [studentId, setStudentId] = useState("");
  const [classKey, setClassKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/students?limit=200").then((response) => response.json()), fetch("/api/classes").then((response) => response.json())])
      .then(([studentResult, classResult]) => { setStudents(studentResult.students ?? []); setClasses(classResult.classes ?? []); })
      .catch(() => setError("Unable to load students and classes."));
  }, []);

  async function download(url: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url);
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Unable to create export."); }
      const blob = await response.blob();
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)/)?.[1] ?? "school-records.zip"; link.click(); URL.revokeObjectURL(link.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create export."); } finally { setBusy(false); }
  }

  const selectedClass = classKey.split("|");
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><h1 className="text-2xl font-bold sm:text-3xl">Download records</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Download a complete ZIP archive with profiles, attendance, fees, results, behavior notes, and class homework. Save it before promoting a student because promotion removes old operational records.</p><section className="mt-8 grid gap-6 rounded-3xl bg-white p-5 shadow-sm sm:p-8 lg:grid-cols-2"><div><h2 className="font-semibold">One student</h2><p className="mt-1 text-sm text-slate-500">Includes every stored record for the selected student.</p><select value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-3"><option value="">Select student</option>{students.map((student) => <option key={student._id} value={student._id}>{student.fullName} · {student.studentId} · {student.class}-{student.section}</option>)}</select><button disabled={!studentId || busy} onClick={() => void download(`/api/records-export?studentId=${studentId}`)} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Preparing export..." : "Download student archive"}</button></div><div><h2 className="font-semibold">Whole class or section</h2><p className="mt-1 text-sm text-slate-500">Includes every student and all class records in one archive.</p><select value={classKey} onChange={(event) => setClassKey(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-3"><option value="">Select class or section</option>{classes.map((item) => <option key={`${item.className}-${item.sectionName}`} value={`${item.className}|${item.sectionName}`}>{item.className}-{item.sectionName} · {item.startDate ?? "session not configured"} to {item.endDate ?? "—"}</option>)}</select><button disabled={!classKey || busy} onClick={() => void download(`/api/records-export?class=${encodeURIComponent(selectedClass[0] ?? "")}&section=${encodeURIComponent(selectedClass[1] ?? "")}`)} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Preparing export..." : "Download class archive"}</button></div></section>{error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}<div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-800"><strong>Archive format:</strong> Open the ZIP to find separate CSV files that work in Excel/Google Sheets, plus a README summary. Nothing is deleted by this page.</div></div></main>;
}
