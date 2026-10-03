"use client";

import { useEffect, useState } from "react";

type Entry = { day: string; period: number; subject: string; room: string; teacher: string; classSection: string };
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export default function TimetableEditor({ scope, target, academicYear = "2026-2027", readOnly = false }: { scope: "class" | "teacher"; target: string; academicYear?: string; readOnly?: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!target) return;
    setLoading(true);
    fetch(`/api/timetables?scope=${scope}&target=${encodeURIComponent(target)}&academicYear=${encodeURIComponent(academicYear)}`)
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setEntries(result.timetable?.entries ?? []); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load timetable"))
      .finally(() => setLoading(false));
  }, [academicYear, scope, target]);
  function add() { setEntries((current) => [...current, { day: "monday", period: current.length + 1, subject: "", room: "", teacher: "", classSection: scope === "class" ? target : "" }]); }
  function update(index: number, field: keyof Entry, value: string) { setEntries((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, [field]: field === "period" ? Number(value) : value } : entry)); }
  async function save() {
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch("/api/timetables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, target, academicYear, entries }) });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Unable to save timetable"); else {
        setEntries(result.timetable?.entries ?? entries);
        setMessage("Timetable saved successfully.");
      }
    } catch { setError("Unable to save timetable. Check your connection and try again."); }
    finally { setSaving(false); }
  }
  if (loading) return <p className="mt-6 rounded-2xl bg-white p-6 text-sm text-slate-500">Loading timetable...</p>;
  return <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Weekly timetable</h2><p className="mt-1 text-sm text-slate-500">Academic year {academicYear}. Add, edit, remove, then save periods.</p></div>{!readOnly && <button type="button" onClick={add} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Add period</button>}</div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<div className="mt-5 space-y-4">{days.map((day) => <div key={day} className="overflow-hidden rounded-xl border border-slate-200"><h3 className="bg-slate-50 px-3 py-2 text-sm font-semibold capitalize text-slate-700">{day}</h3><div className="space-y-2 p-2">{entries.map((entry, index) => entry.day === day && <div key={`${entry.day}-${entry.period}-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[5rem_1.5fr_1fr_1fr_1fr_auto]"><input disabled={readOnly} type="number" min="1" max="12" value={entry.period} onChange={(event) => update(index, "period", event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="Period" /><input disabled={readOnly} value={entry.subject} onChange={(event) => update(index, "subject", event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="Subject" /><input disabled={readOnly} value={entry.teacher} onChange={(event) => update(index, "teacher", event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="Teacher" /><input disabled={readOnly} value={entry.room} onChange={(event) => update(index, "room", event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="Room" /><input disabled={readOnly} value={entry.classSection} onChange={(event) => update(index, "classSection", event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="Class 9-C" />{!readOnly && <button type="button" onClick={() => setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Remove</button>}</div>)}{!entries.some((entry) => entry.day === day) && <p className="px-2 py-3 text-sm text-slate-400">No periods.</p>}</div></div>)}</div>{!readOnly && <button disabled={saving} type="button" onClick={() => void save()} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save timetable"}</button>}</section>;
}
