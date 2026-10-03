"use client";

import { useEffect, useState } from "react";

type Entry = { day: string; period: number; subject: string; room: string; teacher: string; classSection: string };
type TeacherOption = { _id: string; name: string };
type TeacherPeriodCounts = Record<string, Record<string, number>>;
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export default function TimetableEditor({ scope, target, academicYear = "2026-2027", readOnly = false }: { scope: "class" | "teacher"; target: string; academicYear?: string; readOnly?: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [teacherPeriodCounts, setTeacherPeriodCounts] = useState<TeacherPeriodCounts>({});
  const [activeDay, setActiveDay] = useState("monday");
  useEffect(() => {
    if (!target) return;
    setLoading(true);
    fetch(`/api/timetables?scope=${scope}&target=${encodeURIComponent(target)}&academicYear=${encodeURIComponent(academicYear)}`)
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setEntries(result.timetable?.entries ?? []); setTeachers(result.teachers ?? []); setTeacherPeriodCounts(result.teacherPeriodCounts ?? {}); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load timetable"))
      .finally(() => setLoading(false));
  }, [academicYear, scope, target]);
  function add() {
    setEntries((current) => {
      const dayEntries = current.filter((entry) => entry.day === activeDay);
      if (dayEntries.length >= 8) {
        setError(`${activeDay[0].toUpperCase()}${activeDay.slice(1)} already has 8 periods.`);
        return current;
      }
      setError("");
      return [...current, { day: activeDay, period: dayEntries.length + 1, subject: "", room: "", teacher: "", classSection: scope === "class" ? target : "" }];
    });
  }
  function update(index: number, field: keyof Entry, value: string) { setEntries((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, [field]: field === "period" ? Number(value) : value } : entry)); }
  async function save() {
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch("/api/timetables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, target, academicYear, entries }) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to save timetable");
        return false;
      } else {
        setEntries(result.timetable?.entries ?? entries);
        setMessage("Timetable saved successfully.");
        return true;
      }
    } catch { setError("Unable to save timetable. Check your connection and try again."); return false; }
    finally { setSaving(false); }
  }
  if (loading) return <p className="mt-6 rounded-2xl bg-white p-6 text-sm text-slate-500">Loading timetable...</p>;
  const activeIndex = days.indexOf(activeDay);
  const activeEntries = entries.filter((entry) => entry.day === activeDay);
  async function saveAndNext() {
    const saved = await save();
    if (saved && activeIndex < days.length - 1) setActiveDay(days[activeIndex + 1]);
  }
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Schedule builder</p><h2 className="mt-1 text-lg font-bold text-slate-900">8-period weekly timetable</h2><p className="mt-1 text-sm text-slate-500">Select a day, add up to 8 periods, then save. Saved periods stay in MongoDB until you edit or remove them.</p></div>{!readOnly && <button type="button" onClick={add} disabled={activeEntries.length >= 8} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">+ Add period</button>}</div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">{days.map((day) => <button key={day} type="button" onClick={() => setActiveDay(day)} className={`rounded-xl px-2 py-2 text-xs font-semibold capitalize transition sm:text-sm ${activeDay === day ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-blue-50"}`}>{day.slice(0, 3)}<span className="ml-1 opacity-75">({entries.filter((entry) => entry.day === day).length}/8)</span></button>)}</div><div className="mt-5 overflow-hidden rounded-2xl border border-slate-200"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><h3 className="text-sm font-bold capitalize text-slate-800">{activeDay}</h3><span className="text-xs text-slate-400">{activeEntries.length}/8 periods</span></div><div className="space-y-3 p-3">{activeEntries.map((entry) => { const index = entries.indexOf(entry); return <div key={`${entry.day}-${entry.period}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Period {entry.period}</span>{!readOnly && <button type="button" onClick={() => setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-semibold text-slate-500">Period<input disabled={readOnly} type="number" min="1" max="8" value={entry.period} onChange={(event) => update(index, "period", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-500">Subject<input disabled={readOnly} value={entry.subject} onChange={(event) => update(index, "subject", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. Mathematics" /></label>{scope === "class" && <label className="text-xs font-semibold text-slate-500">Teacher<select disabled={readOnly} value={entry.teacher} onChange={(event) => update(index, "teacher", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">No teacher selected</option>{teachers.map((teacher) => <option key={teacher._id} value={teacher.name}>{teacher.name} ({teacherPeriodCounts[teacher.name]?.[activeDay] ?? 0}/8 today)</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-400">No minimum periods required.</span></label>}{scope === "teacher" && <label className="text-xs font-semibold text-slate-500">Class<input disabled={readOnly} value={entry.classSection} onChange={(event) => update(index, "classSection", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. 9-C" /></label>}</div></div>; })}{!activeEntries.length && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">No periods added for {activeDay} yet.</p>}</div></div>{!readOnly && <button disabled={saving} type="button" onClick={() => void saveAndNext()} className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">{saving ? "Saving..." : activeIndex === days.length - 1 ? "Save timetable" : `Save ${activeDay} and continue`}</button>}</section>;
}
