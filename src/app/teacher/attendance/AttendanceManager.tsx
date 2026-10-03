"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import Pagination from "@/components/Pagination";
import { TableSkeleton } from "@/components/Loaders";

type Status = "unmarked" | "present" | "absent" | "late" | "leave" | "holiday";
type StudentAttendance = { id: string; name: string; rollNumber: string; status: Status };
type Props = { assignedClasses: string[] };
const statuses: Status[] = ["unmarked", "present", "absent", "late", "leave", "holiday"];

export default function AttendanceManager({ assignedClasses }: Props) {
  const [classSection, setClassSection] = useState(assignedClasses[0] ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [className, section] = classSection.split("-");

  async function load() {
    if (!className || !section) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/attendance?class=${encodeURIComponent(className)}&section=${encodeURIComponent(section)}&date=${date}&page=${page}&limit=20`);
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Unable to load attendance"); else { setStudents(result.students); setPages(result.pagination?.pages ?? 1); }
    } catch { setError("Unable to connect to the server"); } finally { setLoading(false); }
  }

  useEffect(() => { setPage(1); }, [classSection, date]);
  useEffect(() => { void load(); }, [classSection, date, page]);
  const visibleStudents = useMemo(() => students.filter((student) => student.name.toLowerCase().includes(search.toLowerCase().trim()) && (statusFilter === "all" || student.status === statusFilter)), [students, search, statusFilter]);
  function setStatus(id: string, status: Status) { setStudents((current) => current.map((student) => student.id === id ? { ...student, status } : student)); }
  async function save() { setError(""); setMessage(""); const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ className, section, date, entries: students.map((student) => ({ studentId: student.id, status: student.status })) }) }); const result = await response.json(); if (!response.ok) setError(result.error ?? "Unable to save attendance"); else setMessage("Attendance saved successfully."); }
  function markAll(status: Status) { setStudents((current) => current.map((student) => ({ ...student, status }))); }

  if (!assignedClasses.length) return <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-500">No classes have been assigned to you yet.</div>;
  return <><div className="mt-8 grid gap-4 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-4 sm:p-5"><label className="text-sm font-medium">My class<select value={classSection} onChange={(event) => setClassSection(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5">{assignedClasses.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-medium">Search student<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student name" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-sm font-medium">Filter status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | "all")} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="all">All students</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div>{error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}<section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5"><div><h2 className="font-semibold">{visibleStudents.length} of {students.length} students</h2><p className="mt-1 text-xs text-slate-500">Unmarked is not absent. Holidays are excluded from absence totals.</p></div><div className="flex flex-wrap gap-2"><select defaultValue="present" onChange={(event) => markAll(event.target.value as Status)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold capitalize text-slate-700 sm:flex-none"><option value="present">Mark all present</option><option value="absent">Mark all absent</option><option value="late">Mark all late</option><option value="leave">Mark all leave</option><option value="holiday">Mark all holiday</option><option value="unmarked">Clear all</option></select><button onClick={() => void save()} disabled={loading || !students.length} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 sm:flex-none">Save attendance</button></div></div>{loading ? <TableSkeleton rows={5} className="rounded-none shadow-none" /> : visibleStudents.length ? <div className="divide-y divide-slate-100">{visibleStudents.map((student) => <div key={student.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="font-medium">{student.name}</p><p className="text-xs text-slate-400">Roll {student.rollNumber}</p></div><div className="flex flex-wrap gap-1.5">{statuses.map((status) => <button key={status} onClick={() => setStatus(student.id, status)} className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-[0.7rem] font-semibold capitalize ${student.status === status ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{status}</button>)}</div></div>)}</div> : <div className="px-4 py-16 sm:px-6 sm:py-20 text-center text-sm text-slate-400">No students match this search or status filter.</div>}{!loading && <div className="border-t border-slate-100 px-4 py-4 sm:px-5"><Pagination page={page} pages={pages} onPageChange={setPage} /></div>}</section></>;
}
