"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import WhatsAppBulkSend, { type WhatsAppMessage } from "@/components/WhatsAppBulkSend";

type Student = {
  _id: string;
  fullName: string;
  class: string;
  section: string;
  fatherPhone?: string;
  motherPhone?: string;
};
type ContactMode = "father" | "mother" | "both";

function cleanPhone(value: string | undefined) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

export default function CustomWhatsAppPanel() {
  const [classes, setClasses] = useState<string[]>([]);
  const [classSection, setClassSection] = useState("");
  const [contactMode, setContactMode] = useState<ContactMode>("father");
  const [message, setMessage] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [responsibleUse, setResponsibleUse] = useState(false);

  useEffect(() => {
    fetch("/api/classes", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load classes");
        setClasses((result.classes ?? []).map((item: { className: string; sectionName: string }) => `${item.className}-${item.sectionName}`));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load classes"));
  }, []);

  async function prepare(event: FormEvent) {
    event.preventDefault();
    setError("");
    setOpen(false);
    if (!classSection || !message.trim()) {
      setError("Choose a class and write a message.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/students?classSection=${encodeURIComponent(classSection)}&limit=200`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load students");
      setStudents(Array.isArray(result.students) ? result.students : []);
      setOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load students");
    } finally {
      setLoading(false);
    }
  }

  const messages = useMemo<WhatsAppMessage[]>(() => {
    const output: WhatsAppMessage[] = [];
    const seen = new Set<string>();
    for (const student of students) {
      const numbers = contactMode === "father"
        ? [student.fatherPhone]
        : contactMode === "mother"
          ? [student.motherPhone]
          : [student.fatherPhone, student.motherPhone];
      for (const rawPhone of numbers) {
        const phone = cleanPhone(rawPhone);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        output.push({
          name: `${student.fullName} · ${contactMode === "mother" ? "Mother" : contactMode === "father" ? "Father" : "Parent"}`,
          phone,
          message: message.trim().replaceAll("{studentName}", student.fullName),
        });
      }
    }
    return output;
  }, [contactMode, message, students]);

  const possibleRecipients = students.reduce((count, student) => {
    if (contactMode === "father") return count + (student.fatherPhone ? 1 : 0);
    if (contactMode === "mother") return count + (student.motherPhone ? 1 : 0);
    return count + (student.fatherPhone ? 1 : 0) + (student.motherPhone ? 1 : 0);
  }, 0);

  return (
    <section className="whatsapp-custom-panel rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Family messaging</p>
      <h2 className="mt-2 text-xl font-bold text-slate-900">Send a custom WhatsApp message</h2>
      <p className="mt-1 text-sm text-slate-600">Use the connected bot for automatic delivery, or open prepared WhatsApp chats manually.</p>
      <form onSubmit={prepare} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Class and section
          <select required value={classSection} onChange={(event) => { setClassSection(event.target.value); setOpen(false); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
            <option value="">Select class and section</option>
            {[...new Set(classes)].sort().map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">Contact to message
          <select value={contactMode} onChange={(event) => setContactMode(event.target.value as ContactMode)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
            <option value="father">Father phone</option>
            <option value="mother">Mother phone</option>
            <option value="both">Both available parent phones</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Message
          <textarea required value={message} onChange={(event) => { setMessage(event.target.value); setOpen(false); }} placeholder="Dear parent of {studentName}, ..." className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" />
          <span className="mt-1 block text-xs font-normal text-slate-500">Use <code>{"{studentName}"}</code> to insert each student&apos;s name.</span>
        </label>
        <button disabled={loading} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 sm:col-span-2">
          {loading ? "Loading recipients…" : "Review recipients"}
        </button>
      </form>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {open ? (
        <div className="mt-5 rounded-2xl border border-white bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{messages.length} unique WhatsApp recipient{messages.length === 1 ? "" : "s"} ready</p>
              <p className="mt-1 text-xs text-slate-500">{students.length} students · {possibleRecipients - messages.length} duplicate or invalid number{possibleRecipients - messages.length === 1 ? "" : "s"} excluded</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-slate-500">Close</button>
          </div>
          <label className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <input type="checkbox" checked={responsibleUse} onChange={(event) => setResponsibleUse(event.target.checked)} className="mt-1" />
            <span>I reviewed this recipient list and have permission to contact these families. I understand WhatsApp may restrict unsolicited or excessive messaging, and pacing cannot guarantee account safety.</span>
          </label>
          {messages.length ? <div className="mt-4"><WhatsAppBulkSend title={`Message · ${classSection}`} messages={messages} onClose={() => setOpen(false)} responsibleUse={responsibleUse} /></div> : <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">No phone numbers are available for this contact type.</p>}
        </div>
      ) : null}
    </section>
  );
}
