"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import Link from "next/link";
import { useEffect, useState } from "react";
import Pagination from "@/components/Pagination";
import { TableSkeleton } from "@/components/Loaders";
import BackLink from "@/components/BackLink";

type Teacher = { _id: string; name: string; subject?: string; gender?: string };
type Entry = { teacherId: string; name: string; status: "present" | "absent" | "late" | "leave" | "unmarked" };

export default function AdminTeacherAttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  async function load() {
    setError("");
    setLoading(true);
    try {
      const query = new URLSearchParams({ date, page: String(page), limit: "20" });
      if (statusFilter) query.set("status", statusFilter);
      const response = await fetch(`/api/teacher-attendance?${query}`);
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to load attendance"); return; }
      const records = new Map<string, Entry["status"]>(result.records.map((record: { teacher: string; status: Entry["status"] }) => [String(record.teacher), record.status]));
      setEntries((result.teachers as Teacher[]).map((teacher) => ({ teacherId: String(teacher._id), name: teacher.name, status: records.get(String(teacher._id)) ?? "unmarked" })));
      setPages(result.pagination?.pages ?? 1);
    } catch { setError("Unable to connect to the server"); } finally { setLoading(false); }
  }
  useEffect(() => { setPage(1); }, [date, statusFilter]);
  useEffect(() => { void load(); }, [date, page, statusFilter]);
  function markAll(status: Entry["status"]) { setEntries((current) => current.map((entry) => ({ ...entry, status }))); }
  async function save() {
    const response = await fetch("/api/teacher-attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, entries }) });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Unable to save attendance"); else setMessage("Teacher attendance saved.");
  }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-5xl"><BackLink /><h1 className="mt-6 text-2xl font-bold sm:text-3xl">Teacher attendance</h1><p className="mt-2 text-slate-500">Mark and save attendance for all teachers. Records older than one year are removed automatically.</p><div className="mt-8 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:p-5"><label className="text-sm font-medium">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 sm:w-auto" /></label><label className="text-sm font-medium">Show<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 sm:w-auto"><option value="">All teachers</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="leave">Leave</option></select></label><button onClick={() => markAll("present")} className="w-full rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 sm:w-auto">Mark all present</button><button onClick={() => void save()} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white sm:w-auto">Save attendance</button><a href={`/api/teacher-attendance?date=${date}&status=${statusFilter}&export=csv`} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700 sm:w-auto">Export CSV</a></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">{loading ? <TableSkeleton rows={5} className="rounded-none shadow-none" /> : <div className="divide-y divide-slate-100">{entries.map((entry) => <div key={entry.teacherId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><Link href={`/dashboard/teachers/${entry.teacherId}`} className="min-w-0 break-words font-semibold text-blue-700 hover:underline">{entry.name}</Link><div className="flex flex-wrap gap-2">{(["present", "absent", "late", "leave"] as const).map((status) => <button key={status} onClick={() => setEntries((current) => current.map((item) => item.teacherId === entry.teacherId ? { ...item, status } : item))} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${entry.status === status ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{status}</button>)}</div></div>)}</div>}{!loading && !entries.length && <p className="p-12 text-center text-sm text-slate-400">No teachers found.</p>}{!loading && <div className="border-t border-slate-100 px-4 py-4 sm:px-5"><Pagination page={page} pages={pages} onPageChange={setPage} /></div>}</section></div></main>;
}
