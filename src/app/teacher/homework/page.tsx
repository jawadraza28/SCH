"use client";

 

import { FormEvent, useEffect, useState } from "react";
import { SkeletonRows } from "@/components/Loaders";
import Pagination from "@/components/Pagination";

 

type Work = { _id: string; title: string; subject: string; assignedToClass: string; assignedToSection: string; dueDate: string; expiryDate?: string };
export default function TeacherHomeworkPage() {
  const [form, setForm] = useState({ subject: "", className: "", section: "", title: "", description: "", dueDate: "", expiryDate: "" }); const [homework, setHomework] = useState<Work[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function load(targetPage: number) {
    try {
      const response = await fetch(`/api/homework?page=${targetPage}`);
      const result = await response.json();
      if (response.ok) {
        setHomework(result.homework ?? []);
        setPages(result.pagination?.pages ?? 1);
        setTotal(result.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }

  function goToPage(next: number) {
    if (next === page) return;
    setLoading(true);
    setPage(next);
  }
  useEffect(() => { void load(page); }, [page]);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); setMessage(""); try { const response = await fetch("/api/homework", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const result = await response.json(); if (!response.ok) { setError(result.error ?? "Unable to create homework"); return; } setMessage("Homework created successfully."); setForm({ subject: "", className: "", section: "", title: "", description: "", dueDate: "", expiryDate: "" }); await load(page); } catch { setError("Unable to connect to the server"); } finally { setSaving(false); } }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><a href="/teacher" className="text-sm font-medium text-blue-600">← Teacher workspace</a><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Homework</h1><div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]"><form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="font-semibold">Create text homework</h2><div className="mt-5 space-y-4">{[["subject","Subject"],["className","Class"],["section","Section"],["title","Title"],["dueDate","Due date"],["expiryDate","Remove after"]].map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}<input required={key !== "expiryDate"} type={key === "dueDate" || key === "expiryDate" ? "date" : "text"} value={form[key as keyof typeof form]} onChange={(e) => update(key, e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>)}<label className="block text-sm font-medium">Description<textarea required value={form.description} onChange={(e) => update("description", e.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<button disabled={saving} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Create homework"}</button></form><section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="font-semibold">My homework</h2><div className="mt-5 space-y-3">{loading ? <SkeletonRows rows={3} /> : homework.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No homework assigned yet.</p> : homework.map((item) => <article key={item._id} className="rounded-xl border border-slate-100 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.assignedToClass}-{item.assignedToSection}</p></div><time className="text-xs text-slate-400">Due {new Date(item.dueDate).toLocaleDateString()}{item.expiryDate ? ` · Removes ${new Date(item.expiryDate).toLocaleDateString()}` : ""}</time></div></article>)}</div>{total > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><Pagination page={page} pages={pages} onPageChange={goToPage} /></div>}</section></div></div></main>;
}
