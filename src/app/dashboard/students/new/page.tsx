"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buildVoucherNo } from "@/lib/voucher";

/** One row from GET /api/classes — the class/section pairs that actually exist. */
type ClassOption = { className: string; sectionName: string; capacity: number; occupied?: number };

export default function AdminNewStudentPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", cnic: "", gender: "", className: "", section: "", rollNumber: "", voucherNo: "", fatherName: "", fatherPhone: "", homeAddress: "" });
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/classes")
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load classes"); return (result.classes ?? []) as ClassOption[]; })
      .then((items) => {
        setClasses(items);
        // Start on the first class so the form is usable immediately; the section
        // stays blank on purpose so nobody files a student under the wrong one.
        const first = Array.from(new Set(items.map((item) => item.className))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
        if (first) setForm((current) => ({ ...current, className: first }));
      })
      .catch((cause: Error) => setError(cause.message || "Unable to connect to the server"))
      .finally(() => setLoadingClasses(false));
  }, []);

  const classOptions = useMemo(
    () => Array.from(new Set(classes.map((item) => item.className))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [classes],
  );
  const sectionOptions = useMemo(
    () => classes.filter((item) => item.className === form.className).sort((a, b) => a.sectionName.localeCompare(b.sectionName)),
    [classes, form.className],
  );

  function update(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  /** Picking another class invalidates the section picked for the old one. */
  function chooseClass(value: string) { setForm((current) => ({ ...current, className: value, section: "" })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Unable to add student");
    else {
      // Showing the minted number makes it easy to write on a paper voucher.
      setError("");
      router.push("/dashboard/students");
    }
    setSaving(false);
  }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-3xl">  <Link href="/dashboard/students" className="text-sm font-medium text-blue-600">← Students</Link><h1 className="mt-6 text-2xl font-bold sm:text-3xl">Add student</h1><p className="mt-2 text-slate-500">Students created by an administrator are active immediately and can log in with the default student password.</p><form onSubmit={submit} className="mt-8 rounded-2xl bg-white p-6 shadow-sm sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Full name<input required value={form.fullName} onChange={(e) => update("fullName", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">CNIC<input required value={form.cnic} onChange={(e) => update("cnic", e.target.value)} placeholder="42101-1234567-1" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Gender<select required value={form.gender} onChange={(e) => update("gender", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label><label className="text-sm font-medium">Class<select required value={form.className} onChange={(e) => chooseClass(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="">{loadingClasses ? "Loading classes…" : classOptions.length ? "Select class" : "No classes created yet"}</option>{classOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm font-medium">Section<select required disabled={!form.className} value={form.section} onChange={(e) => update("section", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 disabled:bg-slate-50"><option value="">{!form.className ? "Pick a class first" : sectionOptions.length ? "Select section" : "No sections created for this class"}</option>{sectionOptions.map((item) => <option key={item.sectionName} value={item.sectionName}>{item.sectionName}{typeof item.occupied === "number" ? ` — ${item.occupied}/${item.capacity} seats` : ""}</option>)}</select></label><label className="text-sm font-medium">Roll number<input required value={form.rollNumber} onChange={(e) => update("rollNumber", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Father name<input value={form.fatherName} onChange={(e) => update("fatherName", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium">Parent phone<input value={form.fatherPhone} onChange={(e) => update("fatherPhone", e.target.value)} placeholder="03001234567" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /><span className="mt-1.5 block text-xs text-slate-400">The fee voucher is sent to this number on WhatsApp.</span></label><label className="text-sm font-medium">Fee voucher no<input value={form.voucherNo} onChange={(e) => update("voucherNo", e.target.value.toUpperCase())} placeholder={buildVoucherNo(1)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 uppercase" /><span className="mt-1.5 block text-xs text-slate-400">Leave blank and the school assigns the next number automatically.</span></label><label className="text-sm font-medium sm:col-span-2">Home address<textarea value={form.homeAddress} onChange={(e) => update("homeAddress", e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3" /></label></div>{error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={saving} className="mt-7 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Adding..." : "Add student directly"}</button></form></div></main>;
}
