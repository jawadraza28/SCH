"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import Link from "next/link";
import { useEffect, useState } from "react";

type Teacher = { _id: string; name: string; subject?: string; gender?: string };
type Entry = { teacherId: string; name: string; status: "present" | "absent" | "late" | "leave" | "unmarked" };

export default function AdminTeacherAttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    setError("");
    const response = await fetch(`/api/teacher-attendance?date=${date}`);
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to load attendance"); return; }
    const records = new Map<string, Entry["status"]>(result.records.map((record: { teacher: string; status: Entry["status"] }) => [String(record.teacher), record.status]));
    setEntries((result.teachers as Teacher[]).map((teacher) => ({ teacherId: String(teacher._id), name: teacher.name, status: records.get(String(teacher._id)) ?? "unmarked" })));
  }
  useEffect(() => { void load(); }, [date]);
  function markAll(status: Entry["status"]) { setEntries((current) => current.map((entry) => ({ ...entry, status }))); }
  async function save() {
    const response = await fetch("/api/teacher-attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, entries }) });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Unable to save attendance"); else setMessage("Teacher attendance saved.");
  }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><Link href="/dashboard" className="text-sm font-medium text-blue-600">← Dashboard</Link><h1 className="mt-6 text-2xl font-bold sm:text-3xl">Teacher attendance</h1><p className="mt-2 text-slate-500">Mark and save attendance for all teachers. Records older than one year are removed automatically.</p><div className="mt-8 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 shadow-sm"><label className="text-sm font-medium">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 block rounded-xl border border-slate-200 px-4 py-3" /></label><button onClick={() => markAll("present")} className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Mark all present</button><button onClick={() => void save()} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Save attendance</button></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="divide-y divide-slate-100">{entries.map((entry) => <div key={entry.teacherId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><Link href={`/dashboard/teachers/${entry.teacherId}`} className="font-semibold text-blue-700 hover:underline">{entry.name}</Link><div className="flex gap-2">{(["present", "absent", "late", "leave"] as const).map((status) => <button key={status} onClick={() => setEntries((current) => current.map((item) => item.teacherId === entry.teacherId ? { ...item, status } : item))} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${entry.status === status ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{status}</button>)}</div></div>)}</div>{!entries.length && <p className="p-12 text-center text-sm text-slate-400">No teachers found.</p>}</section></div></main>;
}
