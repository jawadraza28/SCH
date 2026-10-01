"use client";

import { useState } from "react";

type Entry = { id: string; name: string; rollNumber: string; status: "unmarked" | "present" | "absent" | "late" | "leave" | "holiday" };

export default function AdminAttendancePage() {
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadStudents() {
    setError(""); setMessage("");
    if (!className.trim() || !section.trim()) { setError("Class and section are required"); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/attendance?class=${encodeURIComponent(className.trim())}&section=${encodeURIComponent(section.trim().toUpperCase())}&date=${date}`);
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to load students"); return; }
      setStudents(result.students);
    } catch { setError("Unable to connect to the server"); } finally { setLoading(false); }
  }

  function setStatus(id: string, status: Entry["status"]) {
    setStudents((current) => current.map((student) => student.id === id ? { ...student, status } : student));
  }

  async function saveAttendance() {
    setError(""); setMessage("");
    const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ className, section, date, entries: students.map((student) => ({ studentId: student.id, status: student.status })) }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to save attendance"); return; }
    setMessage("Attendance saved successfully.");
  }

  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><a href="/dashboard" className="text-sm font-medium text-blue-600">← Dashboard</a><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Attendance</h1><p className="mt-2 text-slate-500">Administrators can mark attendance for any class or section.</p><div className="mt-8 grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-4"><label className="text-sm font-medium">Class<input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="7" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-medium">Section<input value={section} onChange={(event) => setSection(event.target.value.toUpperCase())} placeholder="A" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-medium">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><button onClick={() => void loadStudents()} disabled={loading} className="self-end rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Loading..." : "Load students"}</button></div>{error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}{students.length > 0 && <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center"><h2 className="font-semibold">{students.length} students</h2><div className="flex gap-2"><button onClick={() => setStudents((current) => current.map((student) => ({ ...student, status: "present" })))} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Mark all present</button><button onClick={() => void saveAttendance()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save attendance</button></div></div><div className="divide-y divide-slate-100">{students.map((student) => <div key={student.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{student.name}</p><p className="text-xs text-slate-400">Roll {student.rollNumber}</p></div><div className="flex gap-2">{(["present", "absent", "late", "leave"] as const).map((status) => <button key={status} onClick={() => setStatus(student.id, status)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${student.status === status ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{status}</button>)}</div></div>)}</div></section>}{!loading && students.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-400">Select a class and section to load students.</div>}</div></main>;
}
