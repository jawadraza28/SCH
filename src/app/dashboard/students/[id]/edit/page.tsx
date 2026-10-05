"use client";

/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormSkeleton } from "@/components/Loaders";

type StudentForm = { fullName: string; cnic: string; gender: string; className: string; section: string; rollNumber: string; fatherName: string; fatherPhone: string; homeAddress: string; dateOfBirth: string; admissionDate: string };

/** One row from GET /api/classes — the class/section pairs that actually exist. */
type ClassOption = { className: string; sectionName: string; capacity: number; occupied?: number };

/** Mongo sends `2011-04-01T00:00:00.000Z`; `<input type="date">` wants `2011-04-01`. */
function toDateInput(value: unknown) {
  const raw = String(value ?? "");
  return raw ? raw.slice(0, 10) : "";
}

export default function EditStudentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [form, setForm] = useState<StudentForm>({ fullName: "", cnic: "", gender: "", className: "", section: "", rollNumber: "", fatherName: "", fatherPhone: "", homeAddress: "", dateOfBirth: "", admissionDate: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  useEffect(() => { fetch(`/api/students/${params.id}`).then(async (response) => { const result = await response.json(); if (!response.ok) setError(result.error ?? "Unable to load student"); else setForm((current) => ({ ...current, ...result.student, className: String(result.student.class ?? ""), section: String(result.student.section ?? "").toUpperCase(), dateOfBirth: toDateInput(result.student.dateOfBirth), admissionDate: toDateInput(result.student.admissionDate) })); }).catch(() => setError("Unable to connect to the server")).finally(() => setLoading(false)); }, []);
  useEffect(() => { fetch("/api/classes").then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load classes"); return (result.classes ?? []) as ClassOption[]; }).then(setClasses).catch(() => setError("Unable to load classes")).finally(() => setLoadingClasses(false)); }, []);

  /** Live classes/sections, plus the student's own pair if it has since been retired. */
  const classOptions = useMemo(() => {
    const list = Array.from(new Set(classes.map((item) => item.className))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (form.className && !list.some((item) => item.toUpperCase() === form.className.toUpperCase())) list.push(form.className);
    return list;
  }, [classes, form.className]);
  const sectionOptions = useMemo(() => {
    const list = classes
      .filter((item) => item.className.toUpperCase() === form.className.toUpperCase())
      .map((item) => ({ value: item.sectionName, capacity: item.capacity, occupied: item.occupied }))
      .sort((a, b) => a.value.localeCompare(b.value));
    if (form.section && !list.some((item) => item.value.toUpperCase() === form.section.toUpperCase())) list.push({ value: form.section, capacity: 0, occupied: undefined });
    return list;
  }, [classes, form.className, form.section]);

  /** Picking another class invalidates the section picked for the old one. */
  function chooseClass(value: string) { setForm((current) => ({ ...current, className: value, section: "" })); }
  function update(key: keyof StudentForm, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); const response = await fetch(`/api/students/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const result = await response.json(); if (!response.ok) setError(result.error ?? "Unable to update student"); else { router.push(`/dashboard/students/${params.id}`); router.refresh(); } setSaving(false); }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-3xl"><a href={`/dashboard/students/${params.id}`} className="text-sm font-medium text-blue-600">← Student profile</a><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Edit student profile</h1><p className="mt-2 text-slate-500">Update class, section, gender, parent information, and other student details.</p>{loading ? <FormSkeleton fields={6} /> : <form onSubmit={submit} className="mt-8 rounded-2xl bg-white p-6 shadow-sm sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Full name<input required value={form.fullName} onChange={(event) => update("fullName", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">CNIC<input required value={form.cnic} onChange={(event) => update("cnic", event.target.value)} placeholder="42101-1234567-1" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Gender<select required value={form.gender} onChange={(event) => update("gender", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label><label className="text-sm font-medium">Class<select required value={form.className} onChange={(event) => chooseClass(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">{loadingClasses ? "Loading classes…" : "Select class"}</option>{classOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm font-medium">Section<select required value={form.section} onChange={(event) => update("section", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">{!form.className ? "Pick a class first" : sectionOptions.length ? "Select section" : "No sections created for this class"}</option>{sectionOptions.map((item) => <option key={item.value} value={item.value}>{item.value}{typeof item.occupied === "number" ? ` — ${item.occupied}/${item.capacity} seats` : ""}</option>)}</select></label><label className="text-sm font-medium">Roll number<input required value={form.rollNumber} onChange={(event) => update("rollNumber", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Father name<input value={form.fatherName} onChange={(event) => update("fatherName", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Father phone<input value={form.fatherPhone} onChange={(event) => update("fatherPhone", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium sm:col-span-2">Home address<textarea value={form.homeAddress} onChange={(event) => update("homeAddress", event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Date of birth<input type="date" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Admission date<input type="date" value={form.admissionDate} onChange={(event) => update("admissionDate", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label></div>{error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={saving} className="mt-7 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save student profile"}</button></form>}</div></main>;
}
