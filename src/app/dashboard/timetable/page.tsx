"use client";

import { useEffect, useState } from "react";
import BackLink from "@/components/BackLink";
import TimetableEditor from "@/components/TimetableEditor";

export default function AdminTimetablePage() {
  const [scope, setScope] = useState<"class" | "teacher">("class");
  const [target, setTarget] = useState("");
  const [classes, setClasses] = useState<{ className: string; sectionName: string }[]>([]);
  const [teachers, setTeachers] = useState<{ _id: string; name: string }[]>([]);
  useEffect(() => { fetch("/api/classes").then((response) => response.json()).then((result) => setClasses(result.classes ?? [])); fetch("/api/teachers").then((response) => response.json()).then((result) => setTeachers(result.teachers ?? [])); }, []);
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><BackLink /><h1 className="mt-6 text-2xl font-bold sm:text-3xl">Timetables</h1><p className="mt-2 text-slate-500">Create a separate timetable for every class or teacher.</p><div className="mt-6 grid gap-4 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2"><label className="text-sm font-medium">Timetable type<select value={scope} onChange={(event) => { setScope(event.target.value as "class" | "teacher"); setTarget(""); }} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="class">Class timetable</option><option value="teacher">Teacher timetable</option></select></label><label className="text-sm font-medium">{scope === "class" ? "Class and section" : "Teacher"}<select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="">Select...</option>{scope === "class" ? classes.map((item) => <option key={`${item.className}-${item.sectionName}`} value={`${item.className}-${item.sectionName}`}>{item.className}-{item.sectionName}</option>) : teachers.map((teacher) => <option key={teacher._id} value={teacher._id}>{teacher.name}</option>)}</select></label></div>{target ? <TimetableEditor scope={scope} target={target} /> : <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">Select a class or teacher to edit its timetable.</p>}</div></main>;
}
