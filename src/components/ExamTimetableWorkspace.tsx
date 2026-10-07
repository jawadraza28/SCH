"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";

type Term = { _id: string; title: string; academicYear: string; startDate: string; endDate: string; description: string; isActive: boolean };
type Entry = { date: string; subject: string; startTime: string; endTime: string; room: string };
type Schedule = { _id: string; examTerm: string | { _id: string; title: string; startDate: string; endDate: string }; classSection: string; entries: Entry[] };

function termId(term: Schedule["examTerm"]) {
  return typeof term === "string" ? term : term._id;
}

function dateLabel(value: string) {
  if (!value) return "Not announced";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ExamTimetableWorkspace({ mode, canCreateTerms = false }: { mode: "manage" | "view"; canCreateTerms?: boolean }) {
  const canEdit = mode === "manage";
  const [terms, setTerms] = useState<Term[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [termForm, setTermForm] = useState({ title: "", academicYear: "2026-2027", startDate: "", endDate: "", description: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/exam-schedules");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load exam timetables");
      setTerms(result.terms ?? []);
      setSchedules(result.schedules ?? []);
      const available = Array.isArray(result.classes) ? result.classes : [];
      if (canEdit && available.length) setClasses(available);
      if (!canEdit && !selectedTerm && result.terms?.[0]?._id) setSelectedTerm(String(result.terms[0]._id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load exam timetables");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const found = schedules.find((item) => termId(item.examTerm) === selectedTerm && item.classSection === selectedClass);
    setEntries(found?.entries ?? []);
  }, [schedules, selectedClass, selectedTerm]);

  const visibleSchedules = useMemo(
    () => schedules.filter((schedule) => !selectedTerm || termId(schedule.examTerm) === selectedTerm),
    [schedules, selectedTerm],
  );

  async function createTerm(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    const response = await fetch("/api/exam-terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(termForm) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to create term"); return; }
    setTermForm({ title: "", academicYear: "2026-2027", startDate: "", endDate: "", description: "" });
    setMessage("Exam term created.");
    await load();
  }

  function addEntry() {
    setEntries((current) => [...current, { date: "", subject: "", startTime: "", endTime: "", room: "" }]);
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch("/api/exam-schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examTerm: selectedTerm, classSection: selectedClass, entries }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to save exam timetable"); return; }
      setMessage("Exam timetable saved.");
      await load();
    } catch { setError("Unable to save exam timetable."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Loading exam timetable…</div>;

  return (
    <div className="mt-6 space-y-6">
      {canCreateTerms && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Exam settings</p><h2 className="mt-1 text-lg font-bold">Create an exam term</h2></div>
            <p className="text-sm text-slate-500">Terms appear as expandable cards for students and staff.</p>
          </div>
          <form onSubmit={createTerm} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input required value={termForm.title} onChange={(event) => setTermForm({ ...termForm, title: event.target.value })} placeholder="Term title" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input required value={termForm.academicYear} onChange={(event) => setTermForm({ ...termForm, academicYear: event.target.value })} placeholder="Academic year" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input type="date" value={termForm.startDate} onChange={(event) => setTermForm({ ...termForm, startDate: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input type="date" value={termForm.endDate} onChange={(event) => setTermForm({ ...termForm, endDate: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <button className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Add term</button>
          </form>
          <input value={termForm.description} onChange={(event) => setTermForm({ ...termForm, description: event.target.value })} placeholder="Optional instructions for students" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        </section>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      {canEdit ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold">Build class exam timetable</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">Select exam term</option>{terms.map((term) => <option key={term._id} value={term._id}>{term.title} · {term.academicYear}</option>)}</select>
            <select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">Select class</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </div>
          {selectedTerm && selectedClass && <form onSubmit={saveSchedule} className="mt-5 space-y-3">
            {entries.map((entry, index) => <div key={`${index}-${entry.subject}`} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_auto]">
              {(["date", "subject", "startTime", "endTime", "room"] as const).map((field) => <input key={field} required={field === "date" || field === "subject"} type={field === "date" ? "date" : field === "startTime" || field === "endTime" ? "time" : "text"} value={entry[field]} onChange={(event) => setEntries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: event.target.value } : item))} placeholder={field === "subject" ? "Subject" : field === "room" ? "Room" : undefined} className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />)}
              <button type="button" onClick={() => setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Remove</button>
            </div>)}
            <div className="flex flex-wrap gap-2"><button type="button" onClick={addEntry} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">+ Add exam</button><button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save timetable"}</button></div>
          </form>}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Exam terms</h2>
        {terms.length === 0 ? <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">No exam terms have been published yet.</div> : terms.map((term) => (
          <details key={term._id} open={selectedTerm === term._id} onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) setSelectedTerm(term._id); }} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Exam term · {term.academicYear}</p><h3 className="mt-1 text-lg font-bold">{term.title}</h3>{term.description && <p className="mt-1 text-sm text-slate-500">{term.description}</p>}</div><div className="flex items-center gap-4 text-sm text-slate-500"><span>{dateLabel(term.startDate)} – {dateLabel(term.endDate)}</span><span className="text-xl transition-transform group-open:rotate-180">⌄</span></div></summary>
            <div className="border-t border-slate-100 p-5 sm:p-6"><p className="mb-4 text-sm font-semibold text-slate-700">Published class schedules</p>{visibleSchedules.filter((item) => termId(item.examTerm) === term._id).length === 0 ? <p className="text-sm text-slate-500">No class timetable published for this term yet.</p> : <div className="grid gap-4 md:grid-cols-2">{visibleSchedules.filter((item) => termId(item.examTerm) === term._id).map((schedule) => <div key={schedule._id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><h4 className="font-bold">{schedule.classSection}</h4><span className="text-xs text-slate-500">{schedule.entries.length} papers</span></div><div className="mt-3 space-y-2">{schedule.entries.map((entry) => <div key={`${schedule.classSection}-${entry.date}-${entry.subject}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{dateLabel(entry.date)} · {entry.subject}</span><span className="text-slate-500">{entry.startTime && `${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ""}`}{entry.room && ` · ${entry.room}`}</span></div>)}</div></div>)}</div>}</div>
          </details>
        ))}
      </section>
    </div>
  );
}
