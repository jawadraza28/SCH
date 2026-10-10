"use client";

import { useEffect, useState } from "react";

type Row = { _id: string; subject: string; totalMarks: number; obtainedMarks: number; percentage: number; result: string; student?: { fullName?: string; class?: string; section?: string; rollNumber?: string }; examTerm?: { title?: string } };

export default function AdminResultsViewer() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [classSection, setClassSection] = useState("");
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    const params = new URLSearchParams({ includeStudent: "true" });
    if (search) params.set("search", search);
    if (classSection) params.set("classSection", classSection);
    if (term) params.set("examTerm", term);
    try {
      const response = await fetch(`/api/results?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load results");
      setRows(result.results ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load results"); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const classes = [...new Set(rows.map((row) => row.student ? `${row.student.class}-${row.student.section}` : "").filter(Boolean))].sort();
  const terms = [...new Set(rows.map((row) => row.examTerm?.title ?? "").filter(Boolean))].sort();
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Results centre</p><h2 className="mt-2 text-2xl font-bold">Search and review results</h2><p className="mt-1 text-sm text-slate-500">Filter by student, class/section, or exam term.</p></div><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">{rows.length} records</span></div>
      <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student name or ID" className="rounded-xl border border-slate-200 px-3 py-3 text-sm" />
        <select value={classSection} onChange={(event) => setClassSection(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">All classes</option>{classes.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={term} onChange={(event) => setTerm(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">All terms</option>{terms.map((item) => <option key={item}>{item}</option>)}</select>
        <button className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500">{loading ? "Loading…" : "Apply filters"}</button>
      </form>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-6 overflow-x-auto"><table className="stack-table w-full text-left text-sm md:min-w-[760px]"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Term</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Marks</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row._id} className="border-t border-slate-100"><td data-label="Student" className="px-4 py-3 font-semibold">{row.student?.fullName ?? "Student"}</td><td data-label="Class" className="px-4 py-3">{row.student ? `${row.student.class}-${row.student.section}` : "-"}</td><td data-label="Term" className="px-4 py-3">{row.examTerm?.title ?? "-"}</td><td data-label="Subject" className="px-4 py-3">{row.subject}</td><td data-label="Marks" className="px-4 py-3">{row.obtainedMarks}/{row.totalMarks} · {row.percentage}%</td><td data-label="Status" className={`px-4 py-3 font-semibold capitalize ${row.result === "pass" ? "text-emerald-600" : "text-rose-600"}`}>{row.result}</td></tr>)}</tbody></table>{!loading && rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No results match these filters.</p> : null}</div>
    </section>
  );
}
