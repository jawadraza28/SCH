"use client";

 

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ListSkeleton } from "@/components/Loaders";
import Pagination from "@/components/Pagination";
import BackLink from "@/components/BackLink";
import CustomWhatsAppPanel from "@/components/CustomWhatsAppPanel";

 

type Notice = { _id: string; title: string; description: string; type: string; audience?: string; classSection?: string; publishDate: string; expiryDate?: string };
export default function NoticesPage() {
  const searchParams = useSearchParams();
  const [notices, setNotices] = useState<Notice[]>([]); const [form, setForm] = useState({ title: "", description: "", type: "general", audience: "all", classSection: "", expiryDate: "" });  const [editingId, setEditingId] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleting, setDeleting] = useState("");
  async function load(targetPage: number) {
    try {
      const response = await fetch(`/api/notices?page=${targetPage}&limit=12`);
      const result = await response.json();
      if (response.ok) {
        setNotices(result.notices ?? []);
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
  useEffect(() => { void load(page); }, [page]); const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (searchParams.get("tab") === "whatsapp") document.getElementById("whatsapp")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams]);
  async function remove(id: string) {
    if (!window.confirm("Delete this notice? This cannot be undone.")) return;
    setDeleting(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/notices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "Unable to delete notice");
        return;
      }
      setMessage("Notice deleted.");
      await load(page);
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setDeleting("");
    }
  }
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); setMessage(""); const response = await fetch("/api/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const result = await response.json(); if (!response.ok) { setError(result.error ?? "Unable to create notice"); return; } setMessage("Notice published successfully."); setForm({ title: "", description: "", type: "general", audience: "all", classSection: "", expiryDate: "" }); await load(page); }
  function edit(notice: Notice) {
    setEditingId(notice._id);
    setForm({ title: notice.title, description: notice.description, type: notice.type, audience: notice.audience ?? "all", classSection: notice.classSection ?? "", expiryDate: notice.expiryDate ? new Date(notice.expiryDate).toISOString().slice(0, 10) : "" });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() { setEditingId(""); setForm({ title: "", description: "", type: "general", audience: "all", classSection: "", expiryDate: "" }); }
  async function saveEdit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const response = await fetch("/api/notices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to update notice"); return; }
    setMessage("Notice updated successfully."); cancelEdit(); await load(page);
  }
  return <main className="app-page bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-6xl"><BackLink /><h1 className="mt-6 text-2xl sm:text-3xl font-bold">Notice board</h1><div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><form onSubmit={editingId ? saveEdit : submit} className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="font-semibold">{editingId ? "Edit notice" : "Publish notice"}</h2><div className="mt-5 space-y-4"><label className="block text-sm font-medium">Title<input required value={form.title} onChange={(e) => update("title", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="block text-sm font-medium">Audience<select value={form.audience} onChange={(e) => update("audience", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="all">Everyone</option><option value="teachers">Teachers only</option><option value="students">Students only</option></select></label><label className="block text-sm font-medium">Class/section (optional)<input value={form.classSection} onChange={(e) => update("classSection", e.target.value)} placeholder="e.g. 2-A" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="block text-sm font-medium">Type<select value={form.type} onChange={(e) => update("type", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="general">General</option><option value="exam">Exam</option><option value="holiday">Holiday</option><option value="event">Event</option><option value="important">Important</option><option value="fee">Fee</option><option value="result">Result</option></select></label><label className="block text-sm font-medium">Expiry date<input type="date" value={form.expiryDate} onChange={(e) => update("expiryDate", e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="block text-sm font-medium">Description<textarea required value={form.description} onChange={(e) => update("description", e.target.value)} className="mt-2 min-h-32 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<div className="mt-5 flex gap-3"><button className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{editingId ? "Save changes" : "Publish notice"}</button>{editingId && <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-600">Cancel</button>}</div></form><section className="space-y-3"><h2 className="font-semibold">Published notices</h2>{loading ? <ListSkeleton rows={3} /> : notices.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-400">No notices published yet.</div> : notices.map((notice) => <article key={notice._id} className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">{notice.type}</span><span className="ml-2 text-xs text-slate-500">{notice.audience === "all" ? "Everyone" : notice.audience}</span><h3 className="mt-3 font-semibold">{notice.title}</h3></div><div className="flex shrink-0 flex-col items-end gap-2"><time className="text-xs text-slate-400">{new Date(notice.publishDate).toLocaleDateString()}</time><div className="flex gap-2"><button type="button" onClick={() => edit(notice)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50">Edit</button><button type="button" onClick={() => void remove(notice._id)} disabled={deleting === notice._id} className="whitespace-nowrap rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">{deleting === notice._id ? "Deleting…" : "Delete"}</button></div></div></div><p className="mt-3 text-sm leading-6 text-slate-600">{notice.description}</p></article>)}{total > 0 && <div className="pt-1"><Pagination page={page} pages={pages} onPageChange={goToPage} /></div>}</section></div>  <div id="whatsapp" className="mt-8"><CustomWhatsAppPanel /></div></div></main>;
}
