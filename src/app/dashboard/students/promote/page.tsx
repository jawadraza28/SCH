"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Student = { _id: string; fullName: string; class: string; section: string; academicYear?: string };
type ClassOption = { className: string; sectionName: string; academicYear: string; capacity: number; occupied?: number };

export default function PromoteStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { Promise.all([fetch("/api/students?status=active").then((r) => r.json()), fetch("/api/classes").then((r) => r.json())]).then(([studentData, classData]) => { setStudents(studentData.students ?? []); setClasses(classData.classes ?? []); }).catch(() => setError("Unable to load promotion data")); }, []);
  const sourceOptions = useMemo(() => [...new Set(students.map((student) => `${student.class}-${student.section}`))].sort(), [students]);
  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const matchesSource = !source || `${student.class}-${student.section}` === source;
      const haystack = `${student.fullName} ${student.class} ${student.section} ${student.academicYear ?? ""}`.toLowerCase();
      return matchesSource && (!query || haystack.includes(query));
    });
  }, [search, source, students]);
  async function promote() {
    setError(""); setMessage("");
    if (!selected.length || !target || !confirmed) { setError("Select students, a destination, and confirm the warning."); return; }
    const [targetClass, targetSection] = target.split("|");
    const backupQuery = selected.map((id) => `studentId=${encodeURIComponent(id)}`).join("&");
    const backupResponse = await fetch(`/api/records-export?${backupQuery}`);
    if (!backupResponse.ok) { const backupResult = await backupResponse.json().catch(() => ({})); setError(backupResult.error ?? "Records backup failed. Promotion was cancelled."); return; }
    const backupBlob = await backupResponse.blob();
    const backupLink = document.createElement("a");
    backupLink.href = URL.createObjectURL(backupBlob);
    backupLink.download = "promotion-records-backup.zip";
    backupLink.click();
    URL.revokeObjectURL(backupLink.href);
    const response = await fetch("/api/students/promote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentIds: selected, targetClass, targetSection, confirmOldRecords: true }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Promotion failed"); return; }
    setMessage(`${result.promoted} student(s) promoted to ${targetClass}-${targetSection}. Old operational records removed: ${result.removed.attendance} attendance, ${result.removed.fees} fees, ${result.removed.results} results.`);
    setStudents((current) => current.filter((student) => !selected.includes(student._id))); setSelected([]); setConfirmed(false);
  }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><Link href="/dashboard/students" className="text-sm font-semibold text-blue-600">← Students</Link><h1 className="mt-6 text-3xl font-bold">Promote students</h1><p className="mt-2 text-slate-500">Move students to a new section for its academic session. Profiles remain preserved; only old operational records are removed.</p><section className="mt-7 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Select students</h2><p className="mt-1 text-xs text-slate-500">{selected.length} selected · {visibleStudents.length} shown</p></div><button type="button" onClick={() => setSelected(selected.length === visibleStudents.length ? [] : [...new Set([...selected, ...visibleStudents.map((student) => student._id)])])} className="text-sm font-semibold text-blue-600">{selected.length === visibleStudents.length ? "Clear shown" : "Select shown"}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, class, session..." className="rounded-xl border border-slate-200 px-3 py-3 text-sm" /><select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">All current classes</option>{sourceOptions.map((item) => <option key={item}>{item}</option>)}</select></div><div className="mt-4 max-h-[32rem] space-y-2 overflow-auto">{visibleStudents.map((student) => <label key={student._id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(student._id)} onChange={() => setSelected((current) => current.includes(student._id) ? current.filter((id) => id !== student._id) : [...current, student._id])} /><span><span className="block font-medium">{student.fullName}</span><span className="text-xs text-slate-500">{student.class}-{student.section} · {student.academicYear || "legacy session"}</span></span></label>)}{visibleStudents.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No students match the current filters.</p> : null}</div></div><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="font-semibold">Promotion destination</h2><select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-3"><option value="">Choose class section</option>{classes.map((item) => <option key={`${item.className}-${item.sectionName}`} value={`${item.className}|${item.sectionName}`}>{item.className}-{item.sectionName} · {item.academicYear}</option>)}</select><label className="mt-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Warning:</strong> promoting permanently deletes selected students&apos; old attendance, fee, and result records. Profiles and family information remain.</span></label>{error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}{message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}<button type="button" onClick={() => void promote()} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500">Promote {selected.length || ""} student(s)</button></div></section></div></main>;
}
