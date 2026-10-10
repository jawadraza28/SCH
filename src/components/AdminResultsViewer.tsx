"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  _id: string;
  subject: string;
  totalMarks: number;
  passingMarks: number;
  obtainedMarks: number;
  percentage: number;
  result: "pass" | "fail";
  createdAt?: string;
  student?: { _id?: string; fullName?: string; studentId?: string; class?: string; section?: string; rollNumber?: string };
  examTerm?: { _id?: string; title?: string; createdAt?: string };
};
type Group = { key: string; student?: Row["student"]; term?: Row["examTerm"]; rows: Row[]; uploaded: number };

export default function AdminResultsViewer() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [classSection, setClassSection] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
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

  const classes = useMemo(() => [...new Set(rows.map((row) => row.student ? `${row.student.class}-${row.student.section}` : "").filter(Boolean))].sort(), [rows]);
  const terms = useMemo(() => [...new Map(rows.map((row) => [row.examTerm?._id ?? row.examTerm?.title ?? "", row.examTerm?.title ?? ""])).entries()].filter(([key]) => key).map(([, value]) => value), [rows]);
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const row of rows) {
      const key = `${row.student?._id ?? row.student?.studentId ?? "student"}|${row.examTerm?._id ?? row.examTerm?.title ?? "term"}`;
      const group = map.get(key) ?? { key, student: row.student, term: row.examTerm, rows: [], uploaded: 0 };
      group.rows.push(row);
      group.uploaded = Math.max(group.uploaded, row.createdAt ? new Date(row.createdAt).getTime() : 0);
      map.set(key, group);
    }
    return [...map.values()].filter((group) => {
      const passed = group.rows.every((row) => row.result === "pass");
      return !status || (status === "pass" ? passed : !passed);
    }).sort((a, b) => b.uploaded - a.uploaded);
  }, [rows, status]);

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Results centre</p><h2 className="mt-2 text-2xl font-bold">Student term results</h2><p className="mt-1 text-sm text-slate-500">Each student appears once per term. Open a result to see every subject mark.</p></div><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">{groups.length} result groups</span></div>
      <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student name or ID" className="rounded-xl border border-slate-200 px-3 py-3 text-sm" />
        <select value={classSection} onChange={(event) => setClassSection(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">All classes</option>{classes.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={term} onChange={(event) => setTerm(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">All terms</option>{terms.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">All statuses</option><option value="pass">Passed</option><option value="fail">Needs attention</option></select>
        <button className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500">{loading ? "Loading…" : "Apply filters"}</button>
      </form>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-6 space-y-3">{groups.map((group, index) => {
        const total = group.rows.reduce((sum, row) => sum + Number(row.totalMarks), 0);
        const obtained = group.rows.reduce((sum, row) => sum + Number(row.obtainedMarks), 0);
        const percentage = total ? Math.round((obtained / total) * 100) : 0;
        const passed = group.rows.every((row) => row.result === "pass");
        return <details key={group.key} open={index === 0} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer list-none p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold">{group.student?.fullName ?? "Student"} <span className="font-normal text-slate-500">· {group.student?.studentId ?? "No ID"}</span></p><p className="mt-1 text-sm text-slate-500">{group.student ? `${group.student.class}-${group.student.section}` : "-"} · {group.term?.title ?? "Exam term"}</p></div><div className="grid grid-cols-3 gap-4 text-center"><div><p className="text-xs text-slate-500">Overall</p><p className="text-xl font-bold text-violet-700">{percentage}%</p></div><div><p className="text-xs text-slate-500">Subjects</p><p className="text-xl font-bold">{group.rows.length}</p></div><div><p className="text-xs text-slate-500">Status</p><p className={`text-sm font-bold capitalize ${passed ? "text-emerald-600" : "text-rose-600"}`}>{passed ? "Pass" : "Fail"}</p></div></div></div></summary><div className="border-t border-slate-100 px-4 py-4 sm:px-5"><div className="mb-4 flex flex-wrap gap-3 text-sm"><span className="rounded-lg bg-slate-50 px-3 py-2">Obtained: <strong>{obtained}/{total}</strong></span><span className="rounded-lg bg-slate-50 px-3 py-2">Uploaded: <strong>{group.uploaded ? new Date(group.uploaded).toLocaleDateString() : "-"}</strong></span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm md:min-w-[620px]"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Marks</th><th className="px-3 py-3">Percentage</th><th className="px-3 py-3">Status</th></tr></thead><tbody>{group.rows.map((row) => <tr key={row._id} className="border-t border-slate-100"><td className="px-3 py-3 font-medium">{row.subject}</td><td className="px-3 py-3">{row.obtainedMarks}/{row.totalMarks} <span className="text-xs text-slate-400">pass {row.passingMarks}</span></td><td className="px-3 py-3">{row.percentage}%</td><td className={`px-3 py-3 font-semibold capitalize ${row.result === "pass" ? "text-emerald-600" : "text-rose-600"}`}>{row.result}</td></tr>)}</tbody></table></div></div></details>;
      })}{!loading && groups.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No results match these filters.</p> : null}</div>
    </section>
  );
}
