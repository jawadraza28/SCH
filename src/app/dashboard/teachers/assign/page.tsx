"use client";

import { FormEvent, useEffect, useState } from "react";
import { FormSkeleton } from "@/components/Loaders";

type Teacher = { _id: string; name: string; assignedClasses?: string[] };
type ClassSection = { _id: string; className: string; sectionName: string };

export default function AssignTeacherPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [assignments, setAssignments] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch("/api/teachers").then((response) => response.json()), fetch("/api/classes").then((response) => response.json())]).then(([teacherResult, classResult]) => {
      setTeachers(teacherResult.teachers ?? []);
      setClasses(classResult.classes ?? []);
    }).catch(() => setError("Unable to load teachers and classes")).finally(() => setLoading(false));
  }, []);

  function selectTeacher(id: string) {
    setTeacherId(id);
    const teacher = teachers.find((item) => item._id === id);
    setAssignments(teacher?.assignedClasses ?? []);
  }

  function toggleAssignment(value: string) {
    setAssignments((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const response = await fetch("/api/teachers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId, assignments }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to save assignments"); return; }
    setMessage("Teacher assignments saved.");
  }

  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-3xl"><a href="/dashboard/teachers" className="text-sm font-medium text-blue-600">← Teachers</a><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Assign classes</h1><p className="mt-2 text-slate-500">A teacher can only access students and academic work in assigned classes.</p>{loading ? <FormSkeleton fields={3} /> : <form onSubmit={submit} className="mt-8 rounded-2xl bg-white p-6 shadow-sm"><label className="block text-sm font-medium">Teacher<select required value={teacherId} onChange={(event) => selectTeacher(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">Select teacher</option>{teachers.map((teacher) => <option key={teacher._id} value={teacher._id}>{teacher.name}</option>)}</select></label><fieldset className="mt-7"><legend className="text-sm font-semibold">Assigned classes</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{classes.map((item) => { const value = `${item.className}-${item.sectionName}`; return <label key={item._id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${assignments.includes(value) ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200"}`}><input type="checkbox" checked={assignments.includes(value)} onChange={() => toggleAssignment(value)} />{value}</label>; })}</div></fieldset>{error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<button disabled={!teacherId} className="mt-7 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Save assignments</button></form>}</div></main>;
}
