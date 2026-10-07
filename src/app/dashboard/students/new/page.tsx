"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buildVoucherNo } from "@/lib/voucher";

type ClassOption = { className: string; sectionName: string; capacity: number; occupied?: number };
type StudentForm = Record<string, string>;

const initialForm: StudentForm = {
  fullName: "", cnic: "", gender: "", className: "", section: "", rollNumber: "", voucherNo: "",
  fatherName: "", fatherCNIC: "", fatherOccupation: "", fatherPhone: "",
  motherName: "", motherCNIC: "", motherOccupation: "", motherPhone: "",
  emergencyContact: "", homeAddress: "", dateOfBirth: "",
};

export default function AdminNewStudentPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/classes").then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load classes");
      return (result.classes ?? []) as ClassOption[];
    }).then((items) => {
      setClasses(items);
      const first = Array.from(new Set(items.map((item) => item.className))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
      if (first) setForm((current) => ({ ...current, className: first }));
    }).catch((cause: Error) => setError(cause.message || "Unable to connect to the server")).finally(() => setLoadingClasses(false));
  }, []);
  const classOptions = useMemo(() => Array.from(new Set(classes.map((item) => item.className))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [classes]);
  const sectionOptions = useMemo(() => classes.filter((item) => item.className === form.className).sort((a, b) => a.sectionName.localeCompare(b.sectionName)), [classes, form.className]);
  function update(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Unable to add student");
      else router.push("/dashboard/students");
    } catch { setError("Unable to connect to the server"); } finally { setSaving(false); }
  }
  const field = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  return (
    <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard/students" className="text-sm font-medium text-blue-600">← Students</Link>
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Add student</h1>
        <p className="mt-2 text-slate-500">Required fields are marked with *. Optional family and emergency details help the school support the student.</p>
        <form onSubmit={submit} className="mt-8 space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <h2 className="font-semibold">Student information</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Full name *<input required value={form.fullName} onChange={(e) => update("fullName", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Student CNIC *<input required value={form.cnic} onChange={(e) => update("cnic", e.target.value)} placeholder="42101-1234567-1" className={field} /></label>
              <label className="text-sm font-medium">Gender *<select required value={form.gender} onChange={(e) => update("gender", e.target.value)} className={field}><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
              <label className="text-sm font-medium">Class *<select required value={form.className} onChange={(e) => setForm((current) => ({ ...current, className: e.target.value, section: "" }))} className={field}><option value="">{loadingClasses ? "Loading classes…" : "Select class"}</option>{classOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="text-sm font-medium">Section *<select required disabled={!form.className} value={form.section} onChange={(e) => update("section", e.target.value)} className={`${field} disabled:bg-slate-50`}><option value="">Select section</option>{sectionOptions.map((item) => <option key={item.sectionName} value={item.sectionName}>{item.sectionName} — {item.occupied ?? 0}/{item.capacity} seats</option>)}</select></label>
              <label className="text-sm font-medium">Roll number *<input required value={form.rollNumber} onChange={(e) => update("rollNumber", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Date of birth <input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Fee voucher number <input value={form.voucherNo} onChange={(e) => update("voucherNo", e.target.value.toUpperCase())} placeholder={buildVoucherNo(1)} className={`${field} uppercase`} /><span className="mt-1 block text-xs text-slate-400">Optional; generated automatically when blank.</span></label>
            </div>
          </section>
          <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <h2 className="font-semibold">Parent and guardian information</h2>
            <p className="mt-1 text-sm text-slate-500">Father name and CNIC are required for identity and sibling matching. Other family fields are optional.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">Father name *<input required value={form.fatherName} onChange={(e) => update("fatherName", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Father CNIC *<input required value={form.fatherCNIC} onChange={(e) => update("fatherCNIC", e.target.value)} placeholder="42101-1234567-1" className={field} /></label>
              <label className="text-sm font-medium">Father occupation <input value={form.fatherOccupation} onChange={(e) => update("fatherOccupation", e.target.value)} placeholder="Business, teacher, driver…" className={field} /></label>
              <label className="text-sm font-medium">Father phone <input value={form.fatherPhone} onChange={(e) => update("fatherPhone", e.target.value)} placeholder="03001234567" className={field} /></label>
              <label className="text-sm font-medium">Mother name <input value={form.motherName} onChange={(e) => update("motherName", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Mother CNIC <input value={form.motherCNIC} onChange={(e) => update("motherCNIC", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Mother occupation <input value={form.motherOccupation} onChange={(e) => update("motherOccupation", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Mother phone <input value={form.motherPhone} onChange={(e) => update("motherPhone", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium">Emergency contact <input value={form.emergencyContact} onChange={(e) => update("emergencyContact", e.target.value)} className={field} /></label>
              <label className="text-sm font-medium sm:col-span-2">Home address <textarea value={form.homeAddress} onChange={(e) => update("homeAddress", e.target.value)} className={`${field} min-h-24`} /></label>
            </div>
          </section>
          {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <button disabled={saving} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-600/20 disabled:opacity-60">{saving ? "Adding…" : "Add student directly"}</button>
        </form>
      </div>
    </main>
  );
}
