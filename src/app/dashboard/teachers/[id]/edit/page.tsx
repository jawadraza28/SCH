"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormSkeleton } from "@/components/Loaders";

type TeacherForm = { name: string; email: string; cnic: string; phone: string; subject: string; gender: string; accountStatus: string; salary: string };

export default function EditTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState("");
  const [form, setForm] = useState<TeacherForm>({ name: "", email: "", cnic: "", phone: "", subject: "", gender: "", accountStatus: "active", salary: "0" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const id = (await params).id;
    setTeacherId(id);
    const response = await fetch(`/api/teachers/${id}`);
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to load teacher"); return; }
    setForm((current) => ({ ...current, ...result.teacher, salary: String(result.teacher.salary ?? 0) }));
  }

  useEffect(() => { void load().finally(() => setLoading(false)); }, []);
  function update(key: keyof TeacherForm, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); const response = await fetch("/api/teachers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, teacherId, action: "update" }) }); const result = await response.json(); if (!response.ok) setError(result.error ?? "Unable to update teacher"); else { router.push("/dashboard/teachers"); router.refresh(); } setSaving(false); }

  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-3xl"><Link href="/dashboard/teachers" className="text-sm font-medium text-blue-600">← Teachers</Link><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Edit teacher</h1><p className="mt-2 text-slate-500">Update teacher profile and account status.</p>{loading ? <FormSkeleton /> : <form onSubmit={submit} className="mt-8 rounded-2xl bg-white p-6 shadow-sm sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Full name<input required value={form.name} onChange={(event) => update("name", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Email<input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">CNIC<input required value={form.cnic} onChange={(event) => update("cnic", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label>  <label className="text-sm font-medium">Subject<input value={form.subject} onChange={(event) => update("subject", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Monthly salary<input min="0" step="1" type="number" value={form.salary} onChange={(event) => update("salary", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /><span className="mt-1.5 block text-xs text-slate-400">Changing this updates future months only. Salaries already marked paid keep the amount that was paid.</span></label><label className="text-sm font-medium">Gender<select required value={form.gender} onChange={(event) => update("gender", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label><label className="text-sm font-medium">Account status<select value={form.accountStatus} onChange={(event) => update("accountStatus", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending">Pending</option></select></label></div><p className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">Teacher accounts use the school default password.</p>{error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={saving || !teacherId} className="mt-7 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save teacher"}</button></form>}</div></main>;
}
