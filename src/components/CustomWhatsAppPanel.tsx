"use client";

import { useEffect, useState } from "react";
import WhatsAppBulkSend, { type WhatsAppMessage } from "@/components/WhatsAppBulkSend";

type Student = { fullName: string; class: string; section: string; fatherPhone?: string; motherPhone?: string };

export default function CustomWhatsAppPanel() {
  const [classes, setClasses] = useState<string[]>([]);
  const [classSection, setClassSection] = useState("");
  const [message, setMessage] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/classes").then((response) => response.json()).then((result) => setClasses((result.classes ?? []).map((item: { className: string; sectionName: string }) => `${item.className}-${item.sectionName}`))).catch(() => setError("Unable to load classes")); }, []);
  async function prepare(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!classSection || !message.trim()) { setError("Choose a class and write a message."); return; }
    const response = await fetch(`/api/students?classSection=${encodeURIComponent(classSection)}&limit=200`);
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to load students"); return; }
    setStudents(result.students ?? []);
    setOpen(true);
  }
  const messages: WhatsAppMessage[] = students.filter((student) => student.fatherPhone || student.motherPhone).map((student) => ({ name: student.fullName, phone: student.fatherPhone || student.motherPhone || "", message: message.trim() }));
  return <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Family messaging</p><h2 className="mt-2 text-xl font-bold text-slate-900">Send a class message on WhatsApp</h2><p className="mt-1 text-sm text-slate-600">Select a class, write one message, then review the personalised queue before sending.</p><form onSubmit={prepare} className="mt-5 grid gap-4 sm:grid-cols-2"><select required value={classSection} onChange={(event) => setClassSection(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="">Select class and section</option>{[...new Set(classes)].sort().map((item) => <option key={item}>{item}</option>)}</select><textarea required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Dear parent, ..." className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm sm:row-span-2" /><button className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500">Prepare WhatsApp queue</button></form>{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}{open ? <div className="mt-5 rounded-2xl border border-white bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{messages.length} parent numbers found</p><button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-slate-500">Close</button></div><div className="mt-4"><WhatsAppBulkSend title={`Message · ${classSection}`} messages={messages} onClose={() => setOpen(false)} /></div></div> : null}</section>;
}
