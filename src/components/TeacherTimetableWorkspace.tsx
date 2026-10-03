"use client";

import { useEffect, useState } from "react";
import TimetableEditor from "@/components/TimetableEditor";

export default function TeacherTimetableWorkspace({ teacherId }: { teacherId: string }) {
  const [classes, setClasses] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/teachers/me/classes")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load assigned classes");
        setClasses(result.assignedClasses ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load assigned classes"));
  }, []);

  return <div className="mt-6 space-y-8"><section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6"><h2 className="font-semibold">Your timetable</h2><p className="mt-1 text-sm text-slate-500">Add, edit, remove, and save your own teaching periods.</p></section><TimetableEditor scope="teacher" target={teacherId} /><section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6"><h2 className="font-semibold">Assigned class timetable</h2><p className="mt-1 text-sm text-slate-500">You can edit timetables only for classes assigned to you.</p>{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<label className="mt-4 block text-sm font-medium">Select class<select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 sm:max-w-md"><option value="">Select a class</option>{classes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></section>{target && <TimetableEditor scope="class" target={target} />}</div>;
}
