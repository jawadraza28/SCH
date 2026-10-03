"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Student = { _id: string; fullName: string; class: string; section: string; studentId: string };
type SubjectMark = { subject: string; totalMarks: string; passingMarks: string; obtainedMarks: string };
type PreviousResult = { _id: string; subject: string; totalMarks: number; passingMarks: number; obtainedMarks: number; percentage: number; result: "pass" | "fail"; examTerm?: { title?: string } };

const starterSubjects = (): SubjectMark[] => Array.from({ length: 7 }, () => ({ subject: "", totalMarks: "100", passingMarks: "40", obtainedMarks: "" }));

export default function TeacherResultsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ studentId: "", examTitle: "First Term" });
  const [subjects, setSubjects] = useState<SubjectMark[]>(starterSubjects);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [previousResults, setPreviousResults] = useState<PreviousResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [editingResult, setEditingResult] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<SubjectMark>({ subject: "", totalMarks: "", passingMarks: "", obtainedMarks: "" });

  useEffect(() => {
    fetch("/api/teachers/me/classes").then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setClasses(result.assignedClasses ?? []);
    }).catch(() => setError("Unable to load assigned classes")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setForm((current) => ({ ...current, studentId: "" }));
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    setLoading(true);
    fetch(`/api/students?classSection=${encodeURIComponent(selectedClass)}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStudents(Array.isArray(result.students) ? result.students : []);
    }).catch(() => setError("Unable to load students for this class")).finally(() => setLoading(false));
  }, [selectedClass]);

  useEffect(() => {
    setPreviousResults([]);
    setEditingResult(null);
    if (!form.studentId) return;
    setResultsLoading(true);
    fetch(`/api/results?studentId=${encodeURIComponent(form.studentId)}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPreviousResults(Array.isArray(result.results) ? result.results : []);
    }).catch(() => setError("Unable to load previous results")).finally(() => setResultsLoading(false));
  }, [form.studentId]);

  const totals = useMemo(() => {
    const total = subjects.reduce((sum, item) => sum + (Number(item.totalMarks) || 0), 0);
    const obtained = subjects.reduce((sum, item) => sum + (Number(item.obtainedMarks) || 0), 0);
    return { total, obtained, percentage: total ? Math.round((obtained / total) * 100) : 0 };
  }, [subjects]);

  const updateSubject = (index: number, key: keyof SubjectMark, value: string) => {
    setSubjects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: form.studentId,
          examTitle: form.examTitle,
          subjects: subjects.map((item) => ({ ...item, totalMarks: Number(item.totalMarks), passingMarks: Number(item.passingMarks), obtainedMarks: Number(item.obtainedMarks) })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to save results");
        return;
      }

      async function updatePreviousResult(id: string) {
        setError("");
        setMessage("");
        const response = await fetch(`/api/results/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          ...editValues,
          totalMarks: Number(editValues.totalMarks),
          passingMarks: Number(editValues.passingMarks),
          obtainedMarks: Number(editValues.obtainedMarks),
        }) });
        const result = await response.json();
        if (!response.ok) { setError(result.error ?? "Unable to update result"); return; }
        setPreviousResults((current) => current.map((item) => item._id === id ? result.result : item));
        setEditingResult(null);
        setMessage("Previous result updated successfully.");
      }

      async function deletePreviousResult(id: string) {
        if (!window.confirm("Delete this previous result?")) return;
        setError("");
        setMessage("");
        const response = await fetch(`/api/results/${id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) { setError(result.error ?? "Unable to delete result"); return; }
        setPreviousResults((current) => current.filter((item) => item._id !== id));
        setMessage("Previous result deleted successfully.");
      }
      setMessage(`${result.count} subject results saved successfully.`);
    } catch {
      setError("Unable to save results");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/teacher" className="text-sm font-medium text-blue-600">← Teacher workspace</Link>
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Add term result</h1>
        <p className="mt-2 text-slate-500">Add all papers for one term together. First Term starts with seven subject rows.</p>
        <form onSubmit={submit} className="mt-8 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium">Class
              <select required value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3">
                <option value="">{loading ? "Loading classes…" : "Select class"}</option>
                {classes.map((classSection) => <option key={classSection} value={classSection}>{classSection}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Student
              <select required value={form.studentId} onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" disabled={!selectedClass || loading}>
                <option value="">{!selectedClass ? "Select a class first" : loading ? "Loading students…" : "Select student"}</option>
                {students.map((student) => <option key={student._id} value={student._id}>{student.fullName} · {student.class}-{student.section}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Exam / term title
              <input required value={form.examTitle} onChange={(event) => setForm((current) => ({ ...current, examTitle: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
            </label>
          </div>
            <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div><h2 className="font-semibold text-slate-900">Previous results</h2><p className="mt-1 text-sm text-slate-600">Review, edit, or delete this student&apos;s saved subject results.</p></div>
                {form.studentId && <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">{resultsLoading ? "Loading…" : `${previousResults.length} subject${previousResults.length === 1 ? "" : "s"}`}</span>}
              </div>
              {!form.studentId ? <p className="mt-4 text-sm text-slate-500">Select a student to see previous results.</p> : !resultsLoading && previousResults.length === 0 ? <p className="mt-4 text-sm text-slate-500">No previous results for this student.</p> : <div className="mt-4 space-y-3">
                {previousResults.map((item) => editingResult === item._id ? <div key={item._id} className="grid gap-2 rounded-xl border border-blue-200 bg-white p-3 sm:grid-cols-[1.5fr_repeat(3,1fr)_auto] sm:items-end">
                  {(["subject", "totalMarks", "passingMarks", "obtainedMarks"] as const).map((key) => <label key={key} className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key === "obtainedMarks" ? "Obtained" : key === "totalMarks" ? "Total" : key === "passingMarks" ? "Passing" : "Subject"}<input value={editValues[key]} onChange={(event) => setEditValues((current) => ({ ...current, [key]: event.target.value }))} type={key === "subject" ? "text" : "number"} min={key === "totalMarks" ? "1" : "0"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" /></label>)}
                  <div className="flex gap-2"><button type="button" onClick={() => updatePreviousResult(item._id)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Save</button><button type="button" onClick={() => setEditingResult(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button></div>
                </div> : <div key={item._id} className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{item.subject} <span className="ml-2 text-xs font-normal text-slate-500">{item.examTerm?.title ?? "Exam term"}</span></p><p className="mt-1 text-sm text-slate-600">{item.obtainedMarks}/{item.totalMarks} marks · {item.percentage}% · <span className={item.result === "pass" ? "text-emerald-600" : "text-red-600"}>{item.result}</span></p></div><div className="flex gap-2"><button type="button" onClick={() => { setEditingResult(item._id); setEditValues({ subject: item.subject, totalMarks: String(item.totalMarks), passingMarks: String(item.passingMarks), obtainedMarks: String(item.obtainedMarks) }); }} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Edit</button><button type="button" onClick={() => deletePreviousResult(item._id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">Delete</button></div></div>)}
              </div>}
            </section>
          <div className="mt-7 flex items-center justify-between gap-3">
            <div><h2 className="font-semibold">Subject papers</h2><p className="mt-1 text-sm text-slate-500">Enter total, passing and obtained marks for every paper.</p></div>
            <button type="button" onClick={() => setSubjects((current) => [...current, { subject: "", totalMarks: "100", passingMarks: "40", obtainedMarks: "" }])} className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">+ Add subject</button>
          </div>
          <div className="mt-4 space-y-3">
            {subjects.map((item, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1.5fr_repeat(3,1fr)_auto] sm:items-end">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject<input required value={item.subject} onChange={(event) => updateSubject(index, "subject", event.target.value)} placeholder={`Paper ${index + 1}`} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" /></label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total<input required type="number" min="1" value={item.totalMarks} onChange={(event) => updateSubject(index, "totalMarks", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" /></label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passing<input required type="number" min="0" value={item.passingMarks} onChange={(event) => updateSubject(index, "passingMarks", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" /></label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Obtained<input required type="number" min="0" value={item.obtainedMarks} onChange={(event) => updateSubject(index, "obtainedMarks", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" /></label>
              <button type="button" disabled={subjects.length <= 1} onClick={() => setSubjects((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-2 py-2 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:text-slate-300">Remove</button>
            </div>)}
          </div>
          <div className="mt-6 grid gap-3 rounded-2xl bg-blue-50 p-4 sm:grid-cols-3">
            <div><p className="text-sm text-slate-500">Total marks</p><p className="text-2xl font-bold text-blue-800">{totals.total}</p></div>
            <div><p className="text-sm text-slate-500">Total obtained</p><p className="text-2xl font-bold text-blue-800">{totals.obtained}</p></div>
            <div><p className="text-sm text-slate-500">Overall percentage</p><p className="text-2xl font-bold text-blue-800">{totals.percentage}%</p></div>
          </div>
          {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
          <button disabled={saving} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save all subject results"}</button>
        </form>
      </div>
    </main>
  );
}
